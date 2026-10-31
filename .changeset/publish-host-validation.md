---
"electron-publish": major
---

fix(publish)!: `github.host`, `gitlab.host` and `keygen.host` must be an ASCII host name (punycode for an internationalized name), optionally with a port, and for `gitlab.host` optionally with a path (a GitLab instance under a relative URL root). A value with user info, a query, a fragment, a backslash, `%` or an empty path segment, or a path in `github.host` / `keygen.host`, fails at publish with `InvalidConfigurationError`. See https://www.electron.build/docs/migration/v27-build-changes#publish-host-must-be-a-host-name
