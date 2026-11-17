"""Writes the worker's built-in server for a release build.

Reads BUILTIN_URL and BUILTIN_KEY (the repository secrets SUPABASE_URL and
SUPABASE_KEY, the public values the app is built with, kept as secrets so the
build log masks them) and
overwrites the file named on the command line, `worker/mix_worker/builtin.py`,
in the runner's checkout only: the repository keeps the empty file.
Fails the build when a value is missing or has the wrong shape.
"""

import json
import os
import sys


def main() -> int:
    url = os.environ.get("BUILTIN_URL", "").strip().rstrip("/")
    key = os.environ.get("BUILTIN_KEY", "").strip()
    if not url or not key:
        print("::error::set the repository secrets SUPABASE_URL and SUPABASE_KEY")
        return 1
    if not url.startswith("https://") or not key.startswith("sb_publishable_"):
        print("::error::SUPABASE_URL must start with https:// and SUPABASE_KEY with sb_publishable_")
        return 1
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        f.write('"""Written by the release build (.github/scripts/write_builtin.py)."""\n\n')
        f.write(f"SUPABASE_URL = {json.dumps(url)}\n")
        f.write(f"SUPABASE_KEY = {json.dumps(key)}\n")
    print("built-in server written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
