"""Round 015 T016/T017: the contract the SQL keeps, over a fake queue.

The SQL itself is pinned in `src/server/rules.test.ts` and checked on the real
project; this file documents what the worker may rely on.
"""

import unittest


class FakeQueue:
    def __init__(self):
        self.rows = []
        self.tick = 0
        self.last_claim = {}  # owner -> tick of the owner's latest claim

    def add(self, name, owner, priority=0):
        self.tick += 1
        self.rows.append({"id": name, "owner": owner, "priority": priority, "created": self.tick, "status": "queued"})

    def _take(self, eligible, key):
        rows = [r for r in self.rows if r["status"] == "queued" and eligible(r)]
        if not rows:
            return None
        row = min(rows, key=key)
        self.tick += 1
        row["status"] = "claimed"
        self.last_claim[row["owner"]] = self.tick
        return row["id"]

    def claim_job(self, user):
        """Personal: the signed-in user's own rows, highest priority then oldest."""
        return self._take(lambda r: r["owner"] == user, lambda r: (-r["priority"], r["created"]))

    def claim_any_job(self):
        """Shared: owners never served first, then the owner's latest claim ascending,
        then priority desc inside, then created_at."""
        return self._take(
            lambda r: True,
            lambda r: (self.last_claim.get(r["owner"], 0), -r["priority"], r["created"]),
        )


class FairTurns(unittest.TestCase):
    def test_two_of_one_owner_and_one_of_another_come_back_a_b_a(self):
        q = FakeQueue()
        q.add("A1", "A")
        q.add("A2", "A")
        q.add("B1", "B")
        taken = [q.claim_any_job() for _ in range(3)]
        self.assertEqual([t[0] for t in taken], ["A", "B", "A"])
        self.assertEqual(taken, ["A1", "B1", "A2"])

    def test_priority_orders_within_one_owner_only(self):
        q = FakeQueue()
        q.add("A1", "A")
        q.add("B1", "B")
        q.add("A2", "A", priority=5)
        q.claim_any_job()  # A's turn: its higher priority request first
        self.assertEqual(q.claim_any_job(), "B1")
        q2 = FakeQueue()
        q2.add("A1", "A")
        q2.add("B1", "B")
        q2.add("A2", "A", priority=5)
        self.assertEqual(q2.claim_any_job(), "A2")


class NeverTwice(unittest.TestCase):
    def test_a_personal_and_a_shared_claim_never_take_one_request_twice(self):
        q = FakeQueue()
        for n in range(1, 5):
            q.add(f"A{n}", "A")
        q.add("B1", "B")
        taken = [q.claim_job("A"), q.claim_any_job(), q.claim_job("A"), q.claim_any_job(), q.claim_any_job(), q.claim_job("A")]
        real = [t for t in taken if t is not None]
        self.assertEqual(len(real), len(set(real)))
        self.assertEqual(sorted(real), ["A1", "A2", "A3", "A4", "B1"])
        self.assertIsNone(q.claim_any_job())
        self.assertIsNone(q.claim_job("A"))


if __name__ == "__main__":
    unittest.main()
