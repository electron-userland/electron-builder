---
"electron-updater": major
"app-builder-lib": major
"builder-util-runtime": minor
"electron-builder": patch
---

feat(win)!: a missing `publisherName` fails Windows update signature verification closed.

- **electron-updater**: an NSIS update is rejected with `ERR_UPDATER_INVALID_SIGNATURE` when `app-update.yml` (or `dev-app-update.yml` / the `updateConfigPath` file) has no `publisherName`. A custom `verifyUpdateFileAuthenticodeSignature` / `verifyUpdateCodeSignature` is never called without a `publisherName`. The only opt-out is `verifyUpdateCodeSignature: false` in `app-update.yml`, which electron-builder writes for `win.verifyUpdateCodeSignature: false`; verification is then skipped with one warning per updater. An app with no update config file at all (no `app-update.yml` / `dev-app-update.yml`, e.g. one that only uses `setFeedURL`) is not verified: its feed is configured by the developer.
- **app-builder-lib**: a Windows build that writes `app-update.yml` (`nsis`, `nsis-web` or `electronUpdaterAware` `appx` with a publish configuration of any provider, including one inferred from a GitHub `repository`) fails with `InvalidConfigurationError` while `win.verifyUpdateCodeSignature` is enabled and no `publisherName` resolves: `win.sign: false` / `null`, no code signing certificate, or `win.sign.publisherName: null`, which is not an opt-out. Sign the build, set `win.sign.publisherName` (e.g. `win.sign: { type: "signtool", publisherName: [...] }` when signing outside electron-builder), or set `win.verifyUpdateCodeSignature: false`, which writes `verifyUpdateCodeSignature: false` (and no `publisherName`) into `app-update.yml`. A `publisherName` in the `publish` configuration must be a distinguished name too, and `verifyUpdateCodeSignature` must not be set there.
- **builder-util-runtime**: `PublishConfiguration` has the private, Windows-only `verifyUpdateCodeSignature` field.
- **electron-builder**: `migrate-schema` prints an advisory for `win.sign: false` / `null` or `win.sign.publisherName: null` without `win.verifyUpdateCodeSignature: false`.

See https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification
