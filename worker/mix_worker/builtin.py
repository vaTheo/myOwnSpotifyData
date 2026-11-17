"""The server a released executable talks to when no setting names one.

Empty in the repository: the code holds no project address. The release
build (`.github/workflows/worker-release.yml`) overwrites this file with the
repository secrets `SUPABASE_URL` and `SUPABASE_KEY`, the same public values
the app is built with, before PyInstaller packs it. So a
downloaded executable reaches the owner's server from its first start, and
`mix-worker.env`, `worker/.env` or the environment still win over it.
"""

SUPABASE_URL = ""
SUPABASE_KEY = ""
