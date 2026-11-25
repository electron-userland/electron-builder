---
"electron-publish": patch
---

fix(publish): `keygen.host` with a port (e.g. `keygen.example.com:8443`) sends the port separately instead of failing with `ENOTFOUND`, a trailing slash in `gitlab.host` no longer doubles the slash before `/api/v4`, and a host name with `_` (e.g. `gitlab_ce:8080`) is accepted.
