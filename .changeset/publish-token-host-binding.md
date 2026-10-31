---
"electron-publish": major
"electron-builder-squirrel-windows": major
"app-builder-lib": patch
---

feat(publish)!: a publish token from the environment (`GH_TOKEN`, `GITHUB_TOKEN`, `GITHUB_RELEASE_TOKEN`, `GITLAB_TOKEN`, `KEYGEN_TOKEN`) is sent only to the provider's public host, the host the CI runner reports (`GITHUB_SERVER_URL` / `GITHUB_API_URL`, `CI_SERVER_URL` / `CI_API_V4_URL`) or a host listed in the new `ELECTRON_BUILDER_PUBLISH_TOKEN_HOSTS`; another custom `github.host` / `gitlab.host` / `keygen.host` fails at publish with `InvalidConfigurationError`, and `squirrelWindows.remoteReleases` on another host gets no token from the environment (with a warning). A token set in the configuration still goes to the configured host. `host` must be an ASCII host name with an optional port, and for `gitlab.host` an optional path (user info, a query or a fragment is rejected, and so is a path in `github.host` / `keygen.host`), and the host-deciding variables are ignored in `electron-builder.env`. See https://www.electron.build/docs/migration/v27-build-changes#publish-tokens-from-the-environment-are-bound-to-the-provider-host
