import json
import unittest
import urllib.parse
from pathlib import Path

from mix_worker import links
from mix_worker.links import NO_ANSWER, NOT_A_SET, NOT_FOUND, LinkFailure

CASES = json.loads((Path(__file__).resolve().parents[2] / "src/features/mix/url.cases.json").read_text(encoding="utf-8"))

SHORT = "https://on.soundcloud.com/abc123XYZ"
REAL = "https://soundcloud.com/user/some-mix"
# What a share link's redirect carries (research R1), with made-up values.
SHARING = "?ref=clipboard&p=a&c=0&si=abc123&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing"


class FakeLocate:
    """Answers in order (a raised exception when the answer is one) and remembers every address asked."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.asked = []
        self.timeouts = []

    def __call__(self, url, timeout):
        self.asked.append(url)
        self.timeouts.append(timeout)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def never(url, timeout):
    raise AssertionError(f"no request expected, {url} was asked")


class TrimCases(unittest.TestCase):
    """The same file the app's `url.cases.test.ts` reads: one trim rule (spec 028)."""

    def test_trim(self):
        self.assertGreaterEqual(len(CASES["trim"]), 28)
        for c in CASES["trim"]:
            with self.subTest(input=c["input"]):
                self.assertEqual(links.trim_soundcloud(c["input"]), c["expected"])

    def test_not_a_string(self):
        self.assertIsNone(links.trim_soundcloud(None))


class ResolveShortLink(unittest.TestCase):
    """A share link is followed to the set it leads to, and that address is trimmed."""

    def test_one_redirect_gives_the_trimmed_set_address(self):
        locate = FakeLocate((302, REAL + SHARING))
        self.assertEqual(links.resolve_short_link(SHORT, locate), REAL)
        self.assertEqual(locate.asked, [SHORT])
        self.assertEqual(locate.timeouts, [links.LINK_TIMEOUT_SECONDS])

    def test_every_redirect_status_is_followed(self):
        for status in (301, 302, 303, 307, 308):
            with self.subTest(status=status):
                self.assertEqual(links.resolve_short_link(SHORT, FakeLocate((status, REAL))), REAL)

    def test_the_mobile_and_www_hosts_are_rewritten(self):
        for location in ("https://m.soundcloud.com/user/some-mix/?si=abc123", "https://www.soundcloud.com/user/some-mix#t=10", "https://soundcloud.com:443/user/some-mix"):
            with self.subTest(location=location):
                self.assertEqual(links.resolve_short_link(SHORT, FakeLocate((302, location))), REAL)

    def test_a_private_set_keeps_its_secret_path(self):
        locate = FakeLocate((302, REAL + "/s-AbCdEf123" + SHARING))
        self.assertEqual(links.resolve_short_link(SHORT, locate), REAL + "/s-AbCdEf123")

    def test_a_relative_location_is_joined_to_the_address_asked(self):
        locate = FakeLocate((302, "/next"), (302, REAL))
        self.assertEqual(links.resolve_short_link(SHORT, locate), REAL)
        self.assertEqual(locate.asked, [SHORT, "https://on.soundcloud.com/next"])

    def test_a_chain_on_the_short_host_within_three_requests(self):
        locate = FakeLocate((302, "https://on.soundcloud.com/b"), (301, "https://on.soundcloud.com/c"), (302, REAL + SHARING))
        self.assertEqual(links.resolve_short_link(SHORT, locate), REAL)
        self.assertEqual(len(locate.asked), links.MAX_REQUESTS)

    def test_a_location_without_scheme_takes_https_from_the_address_asked(self):
        self.assertEqual(links.resolve_short_link(SHORT, FakeLocate((302, "//soundcloud.com/user/some-mix?si=abc123"))), REAL)

    def test_the_set_page_itself_is_never_asked(self):
        locate = FakeLocate((302, REAL + SHARING))
        links.resolve_short_link(SHORT, locate)
        self.assertEqual({urllib.parse.urlsplit(u).hostname for u in locate.asked}, {links.SHORT_HOST})


class ResolveShortLinkFailures(unittest.TestCase):
    """Every answer that is not a SoundCloud set address is a reason, and nothing else is asked (contracts/worker.md)."""

    def failure(self, *answers, reason, detail, start=SHORT):
        locate = FakeLocate(*answers)
        self.assertEqual(links.resolve_short_link(start, locate), LinkFailure(reason, detail))
        self.assertTrue(all(urllib.parse.urlsplit(u).hostname == links.SHORT_HOST for u in locate.asked), locate.asked)
        self.assertEqual(locate.answers, [], "an answer was left unasked")
        return locate

    def test_another_site(self):
        self.failure((302, "https://example.com/user/some-mix"), reason=NOT_A_SET, detail="leads to https://example.com")
        self.failure((302, "https://soundcloud.com.example.com/user/some-mix"), reason=NOT_A_SET, detail="leads to https://soundcloud.com.example.com")

    def test_http_user_info_and_a_port_are_refused(self):
        self.failure((302, "http://soundcloud.com/user/some-mix"), reason=NOT_A_SET, detail="leads to http://soundcloud.com")
        self.failure((302, "https://someone:secret@soundcloud.com/user/some-mix"), reason=NOT_A_SET, detail="leads to https://soundcloud.com")
        self.failure((302, "https://soundcloud.com:8443/user/some-mix"), reason=NOT_A_SET, detail="leads to https://soundcloud.com:8443")
        self.failure((302, "https://soundcloud.com:99999/user/some-mix"), reason=NOT_A_SET, detail="leads to an unreadable address")

    def test_a_location_without_scheme_on_another_site(self):
        self.failure((302, "//example.com/user/some-mix"), reason=NOT_A_SET, detail="leads to https://example.com")

    def test_user_info_or_a_port_on_the_short_host_ends_the_chain(self):
        self.failure((302, "https://on.soundcloud.com:8443/next"), reason=NOT_A_SET, detail="leads to https://on.soundcloud.com:8443")
        self.failure((302, "https://someone:secret@on.soundcloud.com/next"), reason=NOT_A_SET, detail="leads to https://on.soundcloud.com")

    def test_an_answer_of_the_wrong_shape_is_a_reason_not_an_error(self):
        self.failure((None, None), reason=NO_ANSWER, detail="HTTP None")
        self.failure((302, 123), reason=NOT_A_SET, detail="no redirect")

    def test_the_log_detail_never_carries_a_path_or_a_query(self):
        locate = FakeLocate((302, "https://example.com/private/path?si=secret-token"))
        got = links.resolve_short_link(SHORT, locate)
        self.assertNotIn("secret-token", got.detail)
        self.assertNotIn("private", got.detail)

    def test_a_redirect_without_location(self):
        self.failure((302, None), reason=NOT_A_SET, detail="no redirect")
        self.failure((302, "  "), reason=NOT_A_SET, detail="no redirect")

    def test_a_fourth_request_is_refused(self):
        hop = (302, "https://on.soundcloud.com/again")
        locate = self.failure(hop, hop, hop, reason=NOT_A_SET, detail="too many redirects")
        self.assertEqual(len(locate.asked), 3)

    def test_a_profile_is_not_a_set(self):
        self.failure((302, "https://soundcloud.com/user"), reason=NOT_A_SET, detail="not a set address")
        self.failure((302, "https://soundcloud.com/"), reason=NOT_A_SET, detail="not a set address")

    def test_not_found(self):
        for status in (400, 404, 410):
            with self.subTest(status=status):
                self.failure((status, None), reason=NOT_FOUND, detail=f"HTTP {status}")

    def test_a_page_instead_of_a_redirect(self):
        for status in (200, 204):
            with self.subTest(status=status):
                self.failure((status, None), reason=NOT_A_SET, detail="no redirect")

    def test_no_answer(self):
        for status in (401, 403, 429, 500, 503):
            with self.subTest(status=status):
                self.failure((status, None), reason=NO_ANSWER, detail=f"HTTP {status}")

    def test_a_network_error_is_no_answer_and_never_raises(self):
        self.failure(TimeoutError("slow"), reason=NO_ANSWER, detail="TimeoutError")
        self.failure(OSError("down"), reason=NO_ANSWER, detail="OSError")
        self.failure((302, "https://on.soundcloud.com/b"), ConnectionResetError(), reason=NO_ANSWER, detail="ConnectionResetError")

    def test_a_start_that_is_not_an_https_share_link_asks_nothing(self):
        for start in ("http://on.soundcloud.com/abc", "https://someone:secret@on.soundcloud.com/abc", "https://on.soundcloud.com:8443/abc"):
            with self.subTest(start=start):
                self.assertEqual(links.resolve_short_link(start, never).reason, NOT_A_SET)

    def test_the_three_reasons(self):
        self.assertEqual(NOT_FOUND, "Short link not found; paste the set's full link")
        self.assertEqual(NO_ANSWER, "SoundCloud did not answer for the short link; ask again later")
        self.assertEqual(NOT_A_SET, "Short link does not lead to a SoundCloud set")


class WorkingAddress(unittest.TestCase):
    """The address a request is worked on: resolved for a share link, trimmed for a SoundCloud page, else as it arrives."""

    def test_a_share_link_is_resolved(self):
        self.assertEqual(links.working_address(SHORT, FakeLocate((302, REAL + SHARING))), REAL)
        self.assertEqual(links.working_address("https://ON.SoundCloud.com/abc123XYZ", FakeLocate((302, REAL))), REAL)

    def test_a_share_link_failure_comes_back_as_it_is(self):
        self.assertEqual(links.working_address(SHORT, FakeLocate((404, None))), LinkFailure(NOT_FOUND, "HTTP 404"))

    def test_a_soundcloud_page_link_is_trimmed_without_a_request(self):
        for link in (
            REAL + "?in_system_playlist=your-moods%3A123456%3A5",
            REAL + "?in=someone/sets/favourites",
            REAL + SHARING,
            "https://m.soundcloud.com/user/some-mix/",
            "https://www.soundcloud.com/user/some-mix#t=1:23",
            REAL,
        ):
            with self.subTest(link=link):
                self.assertEqual(links.working_address(link, never), REAL)

    def test_a_profile_is_left_as_it_arrives(self):
        self.assertEqual(links.working_address("https://soundcloud.com/user?si=abc", never), "https://soundcloud.com/user?si=abc")

    def test_another_platform_is_left_as_it_arrives(self):
        for link in ("https://www.youtube.com/watch?v=abc123&list=PL1&t=30s", "https://www.mixcloud.com/a/b/?play=fb", "https://example.com/on.soundcloud.com/x"):
            with self.subTest(link=link):
                self.assertEqual(links.working_address(link, never), link)


if __name__ == "__main__":
    unittest.main()
