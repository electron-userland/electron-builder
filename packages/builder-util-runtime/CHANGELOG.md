# builder-util-runtime

## 10.0.0-alpha.12
### Major Changes

- Feat(win)!: `matchPublisherName` matches only publisher names that are a distinguished name (DN), every attribute of which must equal the signer's; a bare name never matches the signer's Common Name any more, and its `logger` parameter is removed. New export `isValidPublisherNameDn` tells whether a publisher name is a DN. See https://www.electron.build/docs/migration/v27-build-changes#windows-publishername-must-be-a-distinguished-name _[`#10380`](https://github.com/electron-userland/electron-builder/pull/10380) [`674e18d`](https://github.com/electron-userland/electron-builder/commit/674e18dd3e6d2720c46b42ce309cac83ae760e14)_
- Refactor(win)!: remove the `escapePowerShellSingleQuotes` export, which only shipped in 10.0.0-alpha.11; the Authenticode check passes the file path to PowerShell in an environment variable (`prepareAuthenticodeSignatureExec`), so no path is quoted into a PowerShell script. _[`#10453`](https://github.com/electron-userland/electron-builder/pull/10453) [`ed05bd0`](https://github.com/electron-userland/electron-builder/commit/ed05bd0f734dd3b898b9c43c81abd56c08d242ef)_

### Minor Changes

- Feat(runtime): `HttpExecutor.addRedirectHandlers` is public, so that requests made outside the executor (electron-updater's differential downloads) follow redirects with the same rules: credential headers are dropped on another origin, and the executor's redirect limit applies _[`#10419`](https://github.com/electron-userland/electron-builder/pull/10419) [`2d97c85`](https://github.com/electron-userland/electron-builder/commit/2d97c85e3e3e63aade6497923d3012ce0569e414)_
- Feat(win)!: a missing `publisherName` fails Windows update signature verification closed. _[`#10380`](https://github.com/electron-userland/electron-builder/pull/10380) [`674e18d`](https://github.com/electron-userland/electron-builder/commit/674e18dd3e6d2720c46b42ce309cac83ae760e14)_

  - **electron-updater**: an NSIS update is rejected with `ERR_UPDATER_INVALID_SIGNATURE` when `app-update.yml` (or `dev-app-update.yml` / the `updateConfigPath` file) has no `publisherName`. A custom `verifyUpdateFileAuthenticodeSignature` / `verifyUpdateCodeSignature` is never called without a `publisherName`. The only opt-out is `verifyUpdateCodeSignature: false` in `app-update.yml`, which electron-builder writes for `win.verifyUpdateCodeSignature: false`; verification is then skipped with one warning per updater. An app with no update config file at all (no `app-update.yml` / `dev-app-update.yml`, e.g. one that only uses `setFeedURL`) is not verified: its feed is configured by the developer.
  - **app-builder-lib**: a Windows build that writes `app-update.yml` (`nsis`, `nsis-web` or `electronUpdaterAware` `appx` with a publish configuration of any provider, including one inferred from a GitHub `repository`) fails with `InvalidConfigurationError` while `win.verifyUpdateCodeSignature` is enabled and no `publisherName` resolves: `win.sign: false` / `null`, no code signing certificate, or `win.sign.publisherName: null`, which is not an opt-out. Sign the build, set `win.sign.publisherName` (e.g. `win.sign: { type: "signtool", publisherName: [...] }` when signing outside electron-builder), or set `win.verifyUpdateCodeSignature: false`, which writes `verifyUpdateCodeSignature: false` (and no `publisherName`) into `app-update.yml`. A `publisherName` in the `publish` configuration must be a distinguished name too, and `verifyUpdateCodeSignature` must not be set there.
  - **builder-util-runtime**: `PublishConfiguration` has the private, Windows-only `verifyUpdateCodeSignature` field.
  - **electron-builder**: `migrate-schema` prints an advisory for `win.sign: false` / `null` or `win.sign.publisherName: null` without `win.verifyUpdateCodeSignature: false`.

  See https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification
- Feat(win): export `windowsPowerShellPath()`, which returns the absolute path of the in-box Windows PowerShell (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`) for runtime use such as electron-updater, and throws when `SystemRoot` is not a drive-absolute path. `preparePowerShellExec` and `prepareAuthenticodeSignatureExec` take an optional PowerShell path, used instead of `windowsPowerShellPath()` when given. _[`#10453`](https://github.com/electron-userland/electron-builder/pull/10453) [`ed05bd0`](https://github.com/electron-userland/electron-builder/commit/ed05bd0f734dd3b898b9c43c81abd56c08d242ef)_
- Feat(updater)!: Windows update signature verification fails closed — electron-updater installs an NSIS update only when PowerShell (`Get-AuthenticodeSignature`) verifies it: an update it cannot verify (PowerShell cannot be started or run, times out, or prints unreadable output) is rejected with `ERR_UPDATER_SIGNATURE_UNVERIFIABLE`, and a Windows catalog signature is rejected as invalid unless the app opts in with the new `NsisUpdater.allowCatalogSignature` (default `false`; when `true`, a valid catalog signature is accepted with a warning only when its signer matches `publisherName`). A release can allow it instead with the new `win.allowCatalogSignature` build option (default `false`), which writes `allowCatalogSignature: true` into the `latest.yml` of the `nsis` and `nsis-web` targets; electron-updater honors it only when that manifest's signature was verified against a trusted key (`updateManifestPublicKey`) and ignores it with a warning otherwise. The manifest signature covers it as an extra `allowCatalogSignature:true` line of the `EBUM1` payload only when it is `true`, so manifests without it canonicalize and verify exactly as before, and changing it for a published release means re-signing or republishing `latest.yml`; a signed manifest with a non-boolean `allowCatalogSignature` is rejected. electron-updater 7.0.0-alpha.8 to alpha.11 installs with an update key configured reject a signed manifest that sets it (`ERR_UPDATER_MANIFEST_SIGNATURE_INVALID`), the same way alpha.8 treats a signed `files[].blockMapUrl`. `UpdateInfoAndProvider` gains `manifestSignatureVerified`, and `BaseUpdater.verifyInstallerSignatureOnLaunch` receives the update info the cached installer was matched against. PowerShell is started by absolute path, the installer path is passed in an environment variable, and non-ASCII output is escaped instead of setting a console encoding, so verification works under PowerShell Constrained Language Mode (fixing 7.0.0-alpha.8 to alpha.10). The build-time installer check uses the same invocation. builder-util-runtime adds `prepareAuthenticodeSignatureExec` and `POWERSHELL_ASCII_ESCAPE_FUNCTION`. Migration: where PowerShell may be blocked (AppLocker / WDAC), assign a native `verifyUpdateFileAuthenticodeSignature` in your first electron-updater 7 release — see https://www.electron.build/docs/migration/v27-runtime-changes#windows-update-signature-verification-fails-closed _[`#10416`](https://github.com/electron-userland/electron-builder/pull/10416) [`8366dc6`](https://github.com/electron-userland/electron-builder/commit/8366dc690ba5bc453c45f6ebbb8f8ad3561521df)_

### Patch Changes

- Fix: escaped characters in a Windows `publisherName` distinguished name are decoded correctly. Before, a hex pair was decoded as a single Latin-1 character (`Caf\C3\A9` became `CafÃ©` instead of `Café`), and a `\+` or `\ ` escape followed by a hex digit was read as a hex pair (`Acme\+Bolt` lost the `B`), so such a publisher name never matched the signing certificate and electron-updater rejected the update _[`#10434`](https://github.com/electron-userland/electron-builder/pull/10434) [`6393d7a`](https://github.com/electron-userland/electron-builder/commit/6393d7ae75d15da5147691b135c5bcc7aa520f35)_
- Fix: Fall back to Latin-1 when a hex escape in a distinguished name is not valid UTF-8 _[`#10446`](https://github.com/electron-userland/electron-builder/pull/10446) [`5028cb3`](https://github.com/electron-userland/electron-builder/commit/5028cb37a21b8bdd6d9447e858eacfb8e3834004)_
- Fix: secrets in logs and error messages (passwords, tokens and keys in redacted command lines, environments and request options) are shown as a fingerprint keyed with a random secret of the process, derived with scrypt: the same value has the same fingerprint within a run, but a fingerprint cannot be checked against guessed values offline. A value whose fingerprint cannot be computed is shown as `<redacted>`. _[`#10441`](https://github.com/electron-userland/electron-builder/pull/10441) [`955cd00`](https://github.com/electron-userland/electron-builder/commit/955cd00bd32f4dff0fd5f120b5c7bdad92ea1d7f)_
- Fix(runtime): `HttpExecutor.prepareRedirectUrlOptions` leaves out `host`, so a redirected request goes to the redirect target even when the original request set `host` (ElectronHttpExecutor sets it from a `Host` header) _[`#10419`](https://github.com/electron-userland/electron-builder/pull/10419) [`2d97c85`](https://github.com/electron-userland/electron-builder/commit/2d97c85e3e3e63aade6497923d3012ce0569e414)_
- Start system tools by absolute path instead of looking them up on `PATH`: Windows PowerShell from `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` (for Windows code signing, package-manager commands and `create-self-signed-cert`), PowerShell 7 from `%ProgramFiles%\PowerShell\7\pwsh.exe` on Windows and from the install location of Microsoft's package on macOS and Linux, `prlctl` from the Parallels Desktop install location, and the host Wine (`toolsets.wine: "system"`, the default) from its fixed install locations. `SystemRoot` and `ProgramFiles` must be drive-absolute paths. _[`#10422`](https://github.com/electron-userland/electron-builder/pull/10422) [`a7f005c`](https://github.com/electron-userland/electron-builder/commit/a7f005ce837df409cc7cf9049e3eff74a2d5a503)_

## 10.0.0-alpha.11
### Minor Changes

- Feat(s3)!: explicit AWS credential sources for S3 publishing via the new `awsCredentials` option (restores shared config / IAM Identity Center profiles, #10054) _[`#10257`](https://github.com/electron-userland/electron-builder/pull/10257) [`46be1f4`](https://github.com/electron-userland/electron-builder/commit/46be1f48e51a59b846ca76e631fc9e4e33348fb5)_

  - `awsCredentials.source` is required to publish (no default, no implicit credentials).
  - `awsCredentials.source: "env"` reads only `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`, or the variable names given in `awsCredentials.env`.
  - `awsCredentials.source: "profile"` with `profile` (plus optional `credentialsFile` / `configFile`) reads a named profile from the shared config and credentials files: static keys, IAM Identity Center (SSO), `credential_process` and assume-role. The AWS SDK providers are loaded lazily, only for non-static profiles, and are given explicit paths. Assume-role hops use an explicitly configured STS client (named profile's region, no configured endpoint URLs). `credential_source` and web identity (`web_identity_token_file`) are rejected anywhere in the chain, before the SDK is loaded.
  - `awsCredentials.source: "sso-role-chain"` with `profile` resolves an assume-role profile whose `source_profile` chain (up to 5 hops, no cycles) starts at an IAM Identity Center (SSO) profile: the SSO profile is resolved from the configured files, then STS AssumeRole is called per hop with explicit region, endpoint and credentials (never `AWS_REGION`, `AWS_PROFILE` or `AWS_ENDPOINT_URL*`). `credential_source`, `mfa_serial`, web identity and `credential_process` are rejected in the chain. `source: "profile"` keeps rejecting SSO-sourced role chains and points to this source.
  - Resolved credentials are reused for every file of a publish instead of being resolved again per upload.

  BREAKING CHANGE: S3 publishing fails with an InvalidConfigurationError unless `awsCredentials.source` is set (add `{ "source": "env" }` to keep using `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`). `AWS_PROFILE`, `AWS_SDK_LOAD_CONFIG`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE` and an implicit `~/.aws/credentials` are no longer read. Missing credentials now fail with a clear error instead of an unsigned or env-fallback signature. For dotted bucket names without `region`, the region is looked up only when publishing. `awsCredentials` is never written to `app-update.yml`.

### Patch Changes

- Fix: preserve complete XML text and reject incomplete documents _[`#10125`](https://github.com/electron-userland/electron-builder/pull/10125) [`45d3bc4`](https://github.com/electron-userland/electron-builder/commit/45d3bc431b5274b38b6b50b0b299d9ae6575469b)_
- Fix(updater): download differentially when the update manifest has a hex-encoded sha512, never let a throwing logger stop a differential download or its fallback to a full download, time out stalled requests made with Electron's `net` module, and close the partially written file when a download's response fails or is aborted mid-body _[`#10366`](https://github.com/electron-userland/electron-builder/pull/10366) [`538aef4`](https://github.com/electron-userland/electron-builder/commit/538aef405d68940cb1322147ab050c24eb581342)_
- Fix: enforce the configured API redirect limit without an extra hop _[`#10121`](https://github.com/electron-userland/electron-builder/pull/10121) [`8b71ed8`](https://github.com/electron-userland/electron-builder/commit/8b71ed87224beed7c0674fdd312d54047095d965)_
- Fix: report finite transfer rates for immediate downloads _[`#10122`](https://github.com/electron-userland/electron-builder/pull/10122) [`370d18c`](https://github.com/electron-userland/electron-builder/commit/370d18cb25e18b204d9ddbaf010879f8939cbeef)_
- Refactor(win): export the Windows Authenticode helpers electron-updater verifies update signatures with (`preparePowerShellExec`, `escapePowerShellSingleQuotes`, `parseAuthenticodeSignatureOutput`, `matchPublisherName`), moved unchanged from electron-updater so electron-builder can check signed installers with the same code _[`#10378`](https://github.com/electron-userland/electron-builder/pull/10378) [`60e3708`](https://github.com/electron-userland/electron-builder/commit/60e3708955724138009f157cf0ad3f80a36ddeae)_

## 10.0.0-alpha.10
### Minor Changes

- Feat(builder-util): `log.limit({ key, max, scope })` / `log.once(key, scope)` emit a keyed message at most N times (per process, or per scope object), replacing hand-rolled "already warned" flags; electron-updater counts once-per-updater warnings internally without changing the injectable `Logger` interface. Both share one limiter (`wrap()` on any `{ info, warn, error, debug? }` logger, including `console`), and its `LogLevel`, `LogLimitOptions`, `LoggerLike` and `LimitedLogger` types are now exported from builder-util-runtime (builder-util re-exports them) _[`#10302`](https://github.com/electron-userland/electron-builder/pull/10302) [`5cbbc8d`](https://github.com/electron-userland/electron-builder/commit/5cbbc8de8e0fb585cfa97e80644e8a29ab7d8ff4)_

### Patch Changes

- Fix: stop retry backoff immediately when cancelled _[`#10126`](https://github.com/electron-userland/electron-builder/pull/10126) [`68aa2ff`](https://github.com/electron-userland/electron-builder/commit/68aa2ff1d5bc713819cd98bfb34c890fbe03a93a)_
- Fix(docs): repair broken links and anchors across the docs site and JSDoc, and export the `SnapOptions24`, `SnapOptionsLegacy`, `SnapOptionsCustom` and `RemoteBuildOptions` types from `app-builder-lib` so their API reference pages are generated _[`#10305`](https://github.com/electron-userland/electron-builder/pull/10305) [`2fdbcae`](https://github.com/electron-userland/electron-builder/commit/2fdbcae5b136c486d3afa3e564d032b5a79dae05)_
- Feat!: nest `files`, `extraResources` and `extraFiles` under `fileOptions` _[`#10319`](https://github.com/electron-userland/electron-builder/pull/10319) [`8f55928`](https://github.com/electron-userland/electron-builder/commit/8f5592839b6b2752754c19b8b7190ec86f55ef94)_

  The three file-copy lists live in a `fileOptions?: FilesBuildOptions | null` property at the configuration root and in every platform section (`mac`, `mas`, `masDev`, `win`, `linux`), the same way `directories` groups the build directories: `fileOptions.files`, `mac.fileOptions.extraResources`, and so on. `PlatformSpecificBuildOptions` does not extend `FilesBuildOptions`, and the TypeScript types and the JSON schema only have `fileOptions`.

  Flat `files` / `extraResources` / `extraFiles` keys in a config file, an `extends` parent, a `-c.files=…` override or the `config` object passed to `build()` are applied as their `fileOptions` counterparts before the configuration is validated, logging one warning per process that names the keys found and where they belong. When a flat key and its `fileOptions` counterpart are set on the same object, `fileOptions` wins and the build warns about the conflict. A CLI override or a parent config's flat key is merged with `fileOptions`. A `fileOptions` that is not an object (for example a list of globs written directly under it) fails the build with a message showing the nested form.

  Code that reads `files`, `extraResources` or `extraFiles` from the loaded configuration (for example a hook reading `context.packager.config.files`, or `buildResult.configuration.extraResources`) gets the `fileOptions` value, with a warning per key: the loaded configuration and its platform sections forward these reads through non-enumerable properties, which stay out of the effective config, `JSON.stringify` and `Object.keys`. Assigning them throws a configuration error naming the `fileOptions` property to set instead.

  `deepAssign` (builder-util-runtime) copies only enumerable own properties, so the forwarding properties are never copied into merged options.

  `electron-builder migrate-schema` (static and JS/TS configs) moves flat keys under `fileOptions` at the root and per platform. A flat key also set under `fileOptions` is removed with a warning, since the build ignores it.

  See https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions
- Docs: document `files[].isAdminRightsRequired` as an intentionally unsigned launch hint in signed update manifests. It only selects how the hash-verified installer is launched (directly or via `elevate.exe`), so publishers can correct it in `latest.yml` without re-signing. _[`#10318`](https://github.com/electron-userland/electron-builder/pull/10318) [`434f6e9`](https://github.com/electron-userland/electron-builder/commit/434f6e98b017c14176be9aaf06891f09624c88fc)_

## 10.0.0-alpha.9

### Minor Changes

- Feat(updater): optional `files[].blockMapUrl` in `latest*.yml` names a file's blockmap URL (e.g. a separately pre-signed one) instead of `${url}.blockmap` with the file URL's query string. A relative value resolves like `url` (against the feed URL); an absolute URL is used as-is, with its own host and query string. It gets the feed query and credential headers only on the feed's origin. With a `blockMapUrl`, the old blockmap is not derived from the new file's URL: it comes from the local cache, else from `previousBlockmapBaseUrlOverride`, else that update is downloaded in full (which caches the new blockmap). The manifest signature covers `blockMapUrl` when present, as an extra field on the file record, so manifests without it canonicalize and verify exactly as before; an electron-updater without this change refuses a signed manifest that has one. electron-builder does not write it. The private GitHub and GitLab providers, which resolve files from the release assets, ignore it. _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43) [@mmaietta](https://github.com/mmaietta)_
- Feat!: electron-updater sends update-feed credentials only to downloads on the feed's origin. With the generic, s3, spaces, r2, keygen, bitbucket, github and gitlab providers, a download on another origin than the feed (scheme, host or port) — an absolute `files[].url` or `packages.<arch>.path` in `latest*.yml`, a GitLab release asset link, and the blockmaps and differential range requests derived from them — is requested without the credential headers from `requestHeaders` / `addAuthHeader` (headers such as `Authorization`, the same set that is removed on a cross-origin redirect) and without the feed URL's query string. Such a URL keeps its own query string, so pre-signed URLs work. With every provider, including custom ones, a URL that electron-updater resolves against the feed URL (such as a `files[].url` or a blockmap) gets the feed query only on the feed's origin; as on redirects, an `http` → `https` upgrade of the feed host on the default ports keeps the headers and the query. Downloads on the feed origin are unchanged, and the old blockmap from an app-set `previousBlockmapBaseUrlOverride` keeps the credentials on that origin. If your `latest*.yml` points downloads at another origin that needs these credentials, serve the files from the feed origin or use pre-signed URLs. The NSIS web-package differential download now uses the same per-download headers as other downloads. A custom provider that does not extend a built-in one must declare `Provider.feedBaseUrl` — its feed URL (the credential headers then only go to that origin) or `null` (the request headers go to every download URL) — when the download headers include a credential header: if it does not, `downloadUpdate()` fails with `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED` before any download request. The first download that loses the credential headers, and the first that does not get the feed query, each log a warning once per updater, naming the headers, the query parameters and the origins (never their values), with a link to the migration guide; `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED` links it too. New APIs: `Provider.feedBaseUrl` (`undefined`, not declared, by default), `HttpExecutor.sensitiveHeaderNames`, `HttpExecutor.removeCrossOriginSensitiveHeaders` and `HttpExecutor.isCrossOrigin`. _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43) [@mmaietta](https://github.com/mmaietta)_

### Patch Changes

- Fix: `HttpExecutor.removeCrossOriginSensitiveHeaders` copies the headers with `deepAssign`, which ignores `__proto__`, `constructor` and `prototype` keys _[`#10270`](https://github.com/electron-userland/electron-builder/pull/10270) [`ec9135d`](https://github.com/electron-userland/electron-builder/commit/ec9135d0626879479ffa4235006f06b14375cc43) [@mmaietta](https://github.com/mmaietta)_

## 10.0.0-alpha.8

### Minor Changes

- Feat(security): signed update manifests (Ed25519) with trust lists and multi-signature manifests _[`#9877`](https://github.com/electron-userland/electron-builder/pull/9877) [`d45536f`](https://github.com/electron-userland/electron-builder/commit/d45536f74e63e5c19dd4a590238521f6315812f5) [@mmaietta](https://github.com/mmaietta)_

  Optional Ed25519 signing of auto-update manifests (`latest*.yml`). When signing keys are configured
  (`updateManifest.signingKey`/`signingKeyFile` in config, or `ELECTRON_BUILDER_UPDATE_SIGN_KEY`/`ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE`
  env vars), each manifest is signed over its integrity-critical fields and the matching public keys are
  embedded into `app-update.yml` (both resolved from the same keys on the platform packager, so signing and
  embedding cannot disagree). electron-updater verifies the signature before downloading and refuses to
  update on tamper/missing-signature (fail-closed). Opt-in: when no public key is configured, verification is
  skipped with a one-time warning. New CLI: `electron-builder create-update-key` (prints the public key and its key id).

  Key rotation without a flag day: an install trusts a **list** of public keys (`updateManifestPublicKey` is a
  string or an array; `updateManifest.publicKey`, `signingKey` and `signingKeyFile` accept arrays, a PEM value may
  hold several concatenated keys, and `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` accepts several paths joined with
  the OS path delimiter), and a manifest may carry **several signatures** (`signatures: [{ keyId, signature }]`,
  one per signing key, next to the legacy `signature` of the first key). A manifest is accepted when any trusted
  key validates any of its signatures, so a release signed with `[old, new]` verifies on installs that trust
  either. `AppUpdater.updateManifestPublicKey` accepts a string or an array. A build-time warning flags an
  explicit `publicKey` list that contains none of the signing keys.

  Gating of the Linux package-manager signature-bypass flags landed separately as
  `AppUpdater.allowUnverifiedLinuxPackages` (#9990).

### Patch Changes

- Fix: stop oversized in-memory downloads at the configured limit _[`#10123`](https://github.com/electron-userland/electron-builder/pull/10123) [`6ab9a8c`](https://github.com/electron-userland/electron-builder/commit/6ab9a8c5fbed759e0c9e26064208c422c612b200) [@OskarEichler](https://github.com/OskarEichler)_

## 10.0.0-alpha.7

### Patch Changes

- Docs: fix broken electron.build documentation links in readmes, TSDoc comments, and error messages — point auto-update, code-signing, and multi-platform-build references at their new `/docs/features/` locations, repair the `electron.build./` domain typo, and replace anchors that no longer exist (#10107) _[`#10111`](https://github.com/electron-userland/electron-builder/pull/10111) [`cf39086`](https://github.com/electron-userland/electron-builder/commit/cf39086fbb71e34d1fef0359a026697153e6ee3b) [@claude](https://github.com/apps/claude)_

## 10.0.0-alpha.6

### Patch Changes

- Security hardening and a migrate-schema fix: _[`#10036`](https://github.com/electron-userland/electron-builder/pull/10036) [`b87a0b7`](https://github.com/electron-userland/electron-builder/commit/b87a0b7a533eef1711e600864f2540dc163176d7) [@mmaietta](https://github.com/mmaietta)_
  - `builder-util` `removePassword`: redact single-letter/URI secret flags (`security … -k <password>`, `osslsigncode -key <pkcs11-uri?pin-value=…>`) and whitespace-containing secrets in debug logs, and make the `/b … /c` block-redaction regex ReDoS-safe.
  - `builder-util-runtime` `httpExecutor`: fix the non-functional `maxRedirects` guard (the redirect counter was never advanced), so a redirect loop from a malicious feed/mirror no longer hangs the updater.
  - `electron-updater` `GitLabProvider`: only forward the GitLab token to the channel-file request when its URL is same-origin as the API host, so an off-host/`http://` `direct_asset_url` in the release JSON cannot exfiltrate the token.
  - `app-builder-lib`: defense-in-depth hardening — validate `executableName` before interpolating it into the generated Flatpak launcher, contain custom-toolset extraction within the cache dir, and XML-escape MSI file-association `ext`/`description`.
  - `electron-builder` `migrate-schema`: auto-remove the removed `linux.syncDesktopName` flag.

## 10.0.0-alpha.5

### Major Changes

- Feat(updater): gate legacy top-level manifest `path`/`sha512` behind `electronUpdaterCompatibility` _[`#9992`](https://github.com/electron-userland/electron-builder/pull/9992) [`2c10f1f`](https://github.com/electron-userland/electron-builder/commit/2c10f1fe9c409379208aa5c0a5bc102689fb5cb6) [@mmaietta](https://github.com/mmaietta)_

  BREAKING CHANGE: The legacy top-level `UpdateInfo.path` / `UpdateInfo.sha512` fields are now written to `latest*.yml` only when the declared `electronUpdaterCompatibility` semver range intersects electron-updater versions `<2.16.0` (previously they were written unconditionally), mirroring how the Windows `sha2` field is gated; the legacy `latest-mac.json` is likewise emitted only when the range intersects `<2.0.0`. The default `electronUpdaterCompatibility` is now `>=2.16` (previously `>=2.15`), so none of the legacy fields are emitted by default. Both fields are now optional on the `UpdateInfo` type. Modern clients (electron-updater >=2.16) read the `files[]` array and are unaffected. If you still ship apps that embed electron-updater 1.x – 2.15, set `electronUpdaterCompatibility` to a range that includes them (e.g. `>=1.0.0`) so the legacy descriptor keeps being emitted.

### Minor Changes

- Feat: add Cloudflare R2 publish provider _[`#9773`](https://github.com/electron-userland/electron-builder/pull/9773) [`a086ef3`](https://github.com/electron-userland/electron-builder/commit/a086ef37855406d0abe418ca1beeca605608b510) [@kyletaylored](https://github.com/kyletaylored)_

### Patch Changes

- Fix(updater): detect legacy hex `sha512` manifest values strictly and deprecate them for removal in v28 _[`#9990`](https://github.com/electron-userland/electron-builder/pull/9990) [`65f0403`](https://github.com/electron-userland/electron-builder/commit/65f04035f722199c7bbd5360f7ecbf2bf352a645) [@mmaietta](https://github.com/mmaietta)_

  The updater previously used a fuzzy heuristic (looking for `+`, `/`, `Z`, or `=` characters) to decide whether a manifest `sha512` was hex- or base64-encoded. It now uses a strict check: a value that is exactly 128 hexadecimal characters is treated as legacy hex; anything else is decoded as base64, which is what electron-builder has emitted since 19.x (2017). The two forms cannot collide — base64-encoded sha512 is always 88 characters ending in `==` — and a wrong pick can only fail closed with a checksum mismatch.

  Hex-encoded `sha512` values (from pre-19.x manifests or hand-rolled manifests built from raw `sha512sum` output) remain accepted in v27 but are deprecated: support will be removed in v28. Emit base64 instead, e.g. `sha512sum file.ext | cut -d' ' -f1 | xxd -r -p | base64 -w0`.

  SHA-256 (`sha2`) update checksums are unchanged here — they remain accepted in v27 under the existing v28-removal grace period.

## 10.0.0-alpha.4

### Patch Changes

- Chore(refactor): reducing duplicate code and extracting helper functions _[`#9947`](https://github.com/electron-userland/electron-builder/pull/9947) [`8f3d9fa`](https://github.com/electron-userland/electron-builder/commit/8f3d9fa442aae342c1c5d2a4448a687de1aff8df) [@mmaietta](https://github.com/mmaietta)_

## 10.0.0-alpha.3

### Minor Changes

- Introduce xml escaping for publisher, publisherDisplayName, displayName, description in appxmanifest.xml to avoid issues with xml preserverd characters _[`#9853`](https://github.com/electron-userland/electron-builder/pull/9853) [`deafee9`](https://github.com/electron-userland/electron-builder/commit/deafee9fe5f7bccbf52e73cd0c6085e767f921ce) [@regnete](https://github.com/regnete)_

## 10.0.0-alpha.2

### Patch Changes

- Fix: declare the missing `electron-publish` dependency on `electron-builder`, and switch type-checking to `nodenext` module resolution so the compiler models Node's real ESM loader _[`#9885`](https://github.com/electron-userland/electron-builder/pull/9885) [`96e47b5`](https://github.com/electron-userland/electron-builder/commit/96e47b5b89b76c719b1c06cfdd62a9a17376484e) [@mmaietta](https://github.com/mmaietta)_

## 10.0.0-alpha.1

### Patch Changes

- Fix: resolve runtime ESM/CJS interop for namespace imports of CJS-only packages (`sax`, `which`, `mime`) _[`#9884`](https://github.com/electron-userland/electron-builder/pull/9884) [`7674e60`](https://github.com/electron-userland/electron-builder/commit/7674e6092645df5c7ae0a31530446efe449cd3d6) [@mmaietta](https://github.com/mmaietta)_

## 10.0.0-alpha.0

### Major Changes

- Chore(refactor): remove deprecated `snap` config property and all remaining deprecated APIs. Hard-deletes 14 deprecated features accumulated across the codebase. No migration shims remain. (BREAKING) _[`#9873`](https://github.com/electron-userland/electron-builder/pull/9873) [`9d755c6`](https://github.com/electron-userland/electron-builder/commit/9d755c68f845d169c9b68963c9711d2e75b4800b) [@mmaietta](https://github.com/mmaietta)_
- Feat!: migrate to native ESM, require Node.js >=22.12.0, remove electron-compile _[`#9544`](https://github.com/electron-userland/electron-builder/pull/9544) [`a5121de`](https://github.com/electron-userland/electron-builder/commit/a5121de49582eaa8870d4c05e6ae55eff160a592) [@mmaietta](https://github.com/mmaietta)_

### Patch Changes

- Chore: Code quality modernization: adopt native Node.js APIs and modern TypeScript patterns across the codebase. _[`#9867`](https://github.com/electron-userland/electron-builder/pull/9867) [`f8feadb`](https://github.com/electron-userland/electron-builder/commit/f8feadb0c39934565197d69248274fd62173a94e) [@mmaietta](https://github.com/mmaietta)_

## 9.7.0

### Minor Changes

- Chore: replace app-builder-bin `node-dep-tree` and `rebuild-node-modules` with pure-TS equivalents; `nativeRebuilder: "legacy"` now routes to `@electron/rebuild` sequential mode _[`#9828`](https://github.com/electron-userland/electron-builder/pull/9828) [`198c10c`](https://github.com/electron-userland/electron-builder/commit/198c10c9693d1244bac80cb11af6b75ad363e5a0) [@mmaietta](https://github.com/mmaietta)_

### Patch Changes

- Fix: holistic field detection for sha256 hash redaction _[`#9834`](https://github.com/electron-userland/electron-builder/pull/9834) [`22a7532`](https://github.com/electron-userland/electron-builder/commit/22a7532bd01b9fb42cff7c58d599c7ad683569fe) [@mmaietta](https://github.com/mmaietta)_

## 9.6.3

### Patch Changes

- Chore: stabilize flaky CI tests (electron zip ENOENT, 5xx retries, snap timeouts) _[`#9795`](https://github.com/electron-userland/electron-builder/pull/9795) [`59efef1`](https://github.com/electron-userland/electron-builder/commit/59efef1a8b81ed1ead4e8004043726d2b49cf81f) [@mmaietta](https://github.com/mmaietta)_

## 9.6.2

### Patch Changes

- Fix: harden generated-file output, argument construction, and download validation _[`#9778`](https://github.com/electron-userland/electron-builder/pull/9778) [`d6a5aee`](https://github.com/electron-userland/electron-builder/commit/d6a5aee821138449dc0c082606da6a1bf5ba0798) [@mmaietta](https://github.com/mmaietta)_
- Fix(codeql): resolving GH CodeQL alerts _[`#9783`](https://github.com/electron-userland/electron-builder/pull/9783) [`4866737`](https://github.com/electron-userland/electron-builder/commit/4866737e4fe1f0cca210d318b9ce440f8e978a63) [@mmaietta](https://github.com/mmaietta)_

## 9.6.1

### Patch Changes

- Chore(docs): documentation updates and docusaurus migration _[`#9744`](https://github.com/electron-userland/electron-builder/pull/9744) [`d846315`](https://github.com/electron-userland/electron-builder/commit/d84631587d816a1aa0bff57680bab0f865d7a84f) [@mmaietta](https://github.com/mmaietta)_

## 9.6.0

### Minor Changes

- Feat: pass release notes to GitHub/GitLab release body via `releaseBody` and `releaseName` options _[`#9581`](https://github.com/electron-userland/electron-builder/pull/9581) [`b7df0bc`](https://github.com/electron-userland/electron-builder/commit/b7df0bcef5790814fd6df187346dcec625dc681e) [@asamofal](https://github.com/asamofal)_

## 9.5.1

### Patch Changes

- Chore: bumping version packages of all packages to trigger Trusted Signing provedance release _[`#9362`](https://github.com/electron-userland/electron-builder/pull/9362) [`030269b`](https://github.com/electron-userland/electron-builder/commit/030269bca94b5e3621dbf8883976e1f85a1524f0) [@mmaietta](https://github.com/mmaietta)_

## 9.5.0

### Minor Changes

- [#9209](https://github.com/electron-userland/electron-builder/pull/9209) [`6fd391d9e8390c00c8b0674d8ac3a5b7b6f0f19f`](https://github.com/electron-userland/electron-builder/commit/6fd391d9e8390c00c8b0674d8ac3a5b7b6f0f19f) Thanks [@daihere1993](https://github.com/daihere1993)! - feat: Support gitlab publisher

## 9.4.0

### Minor Changes

- [#9211](https://github.com/electron-userland/electron-builder/pull/9211) [`7c7fd6ca`](https://github.com/electron-userland/electron-builder/commit/7c7fd6ca240eda72048835f754adac92c4ab4e8c) Thanks [@FringeNet](https://github.com/FringeNet)! - fix: implement industry-standard cross-origin redirect auth handling

  Replace hardcoded service-specific hostname checks with sophisticated cross-origin redirect detection that matches industry standards from Python requests library and Apache HttpClient.

  **Key improvements:**

  - **Case-insensitive hostname comparison** for robust origin detection
  - **HTTP→HTTPS upgrade allowance** on standard ports (80→443) for backward compatibility
  - **Proper default port handling** that treats implicit and explicit default ports as equivalent
  - **Standards-compliant cross-origin detection** following RFC specifications

  **Fixes GitHub issue #9207:** GitHub release asset downloads failing with 403 Forbidden when redirected from `api.github.com` to `release-assets.githubusercontent.com` (Azure backend) or other cloud storage services that don't accept GitHub tokens.

  The implementation now handles all cross-origin redirect scenarios while maintaining compatibility with legitimate same-origin redirects and industry-standard HTTP→HTTPS upgrades.

### Patch Changes

- [#9216](https://github.com/electron-userland/electron-builder/pull/9216) [`44b28997`](https://github.com/electron-userland/electron-builder/commit/44b28997f15314730d1bb69303a47dc26f7950d1) Thanks [@taylorhadden](https://github.com/taylorhadden)! - feat(github): Add `tagNamePrefix` option and deprecate `vPrefixedTagName`

## 9.3.3

### Patch Changes

- [#9186](https://github.com/electron-userland/electron-builder/pull/9186) [`1a6ea016`](https://github.com/electron-userland/electron-builder/commit/1a6ea016b7793c75e7586e0e14d5f26d3535c292) Thanks [@daihere1993](https://github.com/daihere1993)! - feat(electron-updater): add GitLab provider support

- [#9177](https://github.com/electron-userland/electron-builder/pull/9177) [`35f5f6e5`](https://github.com/electron-userland/electron-builder/commit/35f5f6e55762ffc377fcd5587a8cea8753184d50) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: remove `shell: true` from node_modules collector so as to prevent shell console logging from malforming the json output

## 9.3.2

### Patch Changes

- [#9018](https://github.com/electron-userland/electron-builder/pull/9018) [`a2f7f735`](https://github.com/electron-userland/electron-builder/commit/a2f7f7350be2379c4917417c92ece5a6ab241708) Thanks [@gtluszcz](https://github.com/gtluszcz)! - Add information how to use electron-publish s3 with credentials stored in ~/.aws/config file.

## 9.3.1

### Patch Changes

- [#8815](https://github.com/electron-userland/electron-builder/pull/8815) [`8e7811d1`](https://github.com/electron-userland/electron-builder/commit/8e7811d18de3acb39ce9253cf2cd9afa4e23f99c) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: "organize imports" + change `ObjectMap` => `Record` for non-external properties (i.e. things that don't get processed for `scheme.json`)

- [#8813](https://github.com/electron-userland/electron-builder/pull/8813) [`07429661`](https://github.com/electron-userland/electron-builder/commit/07429661c0da2248cec5b92eb03390ae19266328) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: extract common `undefined | null` to reuse current (unexported) type `Nullish`. Expose `FileMatcher` instead of `@internal` flag

## 9.3.0

### Minor Changes

- [#8741](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1) Thanks [@0xlau](https://github.com/0xlau)! - Add `forcePathStyle` option to S3Options

- [#8711](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af) Thanks [@hrueger](https://github.com/hrueger)! - Add `host` property to support self-hosted Keygen instances

## 9.3.0-alpha.0

### Minor Changes

- [#8741](https://github.com/electron-userland/electron-builder/pull/8741) [`eacbbf59`](https://github.com/electron-userland/electron-builder/commit/eacbbf593f6ea01a92ffb41d8d28ee5e4e480ea1) Thanks [@0xlau](https://github.com/0xlau)! - Add `forcePathStyle` option to S3Options

- [#8711](https://github.com/electron-userland/electron-builder/pull/8711) [`6f0fb8e4`](https://github.com/electron-userland/electron-builder/commit/6f0fb8e44f035bcd6ff0d6f234b38c20fde066af) Thanks [@hrueger](https://github.com/hrueger)! - Add `host` property to support self-hosted Keygen instances

## 9.2.10

### Patch Changes

- [#8545](https://github.com/electron-userland/electron-builder/pull/8545) [`fc3a78e4e61f916058fca9b15fc16f076c3fabd1`](https://github.com/electron-userland/electron-builder/commit/fc3a78e4e61f916058fca9b15fc16f076c3fabd1) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(deps): update devDependencies, including typescript

## 9.2.9

### Patch Changes

- [#8516](https://github.com/electron-userland/electron-builder/pull/8516) [`d1cb6bdb`](https://github.com/electron-userland/electron-builder/commit/d1cb6bdbf8111156bb16839f501bdd9e6d477338) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(chore): upgrading typescript and fixing compiler errors

## 9.2.8

### Patch Changes

- [#8491](https://github.com/electron-userland/electron-builder/pull/8491) [`178a3c40`](https://github.com/electron-userland/electron-builder/commit/178a3c40f35fa9e91a2e4942f61423effa1289e4) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: migrating to typedoc and updating/improving type+interface definitions

## 9.2.7

### Patch Changes

- [#8486](https://github.com/electron-userland/electron-builder/pull/8486) [`d56cd274`](https://github.com/electron-userland/electron-builder/commit/d56cd274b9d0fedb71889293164a15e51f7cc744) Thanks [@mmaietta](https://github.com/mmaietta)! - fix(deploy): redeploy all packages to sync semver ranges

## 9.2.6

### Patch Changes

- [#8437](https://github.com/electron-userland/electron-builder/pull/8437) [`be625e06`](https://github.com/electron-userland/electron-builder/commit/be625e06273e56de09ed3298209858043fcd1151) Thanks [@juwonjung-hdj](https://github.com/juwonjung-hdj)! - fix: retry renaming update file when EBUSY error occurs due to file lock

## 9.2.5

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8291](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48) Thanks [@IsaacAderogba](https://github.com/IsaacAderogba)! - fix: add MemoLazy to fix codeSigningInfo not responding to changed args

- [#8126](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(docs): update Bitbucket Options token doc

- [#8251](https://github.com/electron-userland/electron-builder/pull/8251) [`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89) Thanks [@m59peacemaker](https://github.com/m59peacemaker)! - Refactored to resolve circular dependency, eliminating warnings from tools such as Rollup

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

## 9.2.5-alpha.4

### Patch Changes

- [#8304](https://github.com/electron-userland/electron-builder/pull/8304) [`1ac86c9e`](https://github.com/electron-userland/electron-builder/commit/1ac86c9ea277a89611d415eb7f2ef70441b0eb28) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: update pnpm to 9.4.0

- [#8291](https://github.com/electron-userland/electron-builder/pull/8291) [`ad668ae1`](https://github.com/electron-userland/electron-builder/commit/ad668ae14ef60fb91dd74aa71562f2fd68fbaa48) Thanks [@IsaacAderogba](https://github.com/IsaacAderogba)! - fix: add MemoLazy to fix codeSigningInfo not responding to changed args

## 9.2.5-alpha.3

### Patch Changes

- [#8251](https://github.com/electron-userland/electron-builder/pull/8251) [`140e2f0e`](https://github.com/electron-userland/electron-builder/commit/140e2f0eb0df79c2a46e35024e96d0563355fc89) Thanks [@m59peacemaker](https://github.com/m59peacemaker)! - Refactored to resolve circular dependency, eliminating warnings from tools such as Rollup

## 9.2.5-alpha.2

### Patch Changes

- [#8126](https://github.com/electron-userland/electron-builder/pull/8126) [`445911a7`](https://github.com/electron-userland/electron-builder/commit/445911a75f9efd6fe61e586ebed6a210d0efcd41) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(docs): update Bitbucket Options token doc

## 9.2.5-alpha.1

### Patch Changes

- [#8108](https://github.com/electron-userland/electron-builder/pull/8108) [`3d4cc7ae`](https://github.com/electron-userland/electron-builder/commit/3d4cc7ae01c4f6154d6ea59726578b1ff99b9daf) Thanks [@beyondkmp](https://github.com/beyondkmp)! - feat: add `minimumSystemVersion` in electron updater

## 9.2.5-alpha.0

### Patch Changes

- [#8110](https://github.com/electron-userland/electron-builder/pull/8110) [`fa7982f1`](https://github.com/electron-userland/electron-builder/commit/fa7982f19feddcb9479ff83af8db1974aea1f8d6) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: entering alpha release stage

## 9.2.4

### Patch Changes

- [#8057](https://github.com/electron-userland/electron-builder/pull/8057) [`ccbb80de`](https://github.com/electron-userland/electron-builder/commit/ccbb80dea4b6146ea2d2186193a1f307096e4d1e) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: upgrading connected dependencies (typescript requires higher eslint version)

## 9.2.3

### Patch Changes

- [#7806](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f) Thanks [@AviVahl](https://github.com/AviVahl)! - fix: update @types/node for compat with newest @types/node

- [#7806](https://github.com/electron-userland/electron-builder/pull/7806) [`db424e8e`](https://github.com/electron-userland/electron-builder/commit/db424e8e876e6ac1985668bf78bd52a02824dd7f) Thanks [@AviVahl](https://github.com/AviVahl)! - fix: compat with newest @types/node

## 9.2.2

### Patch Changes

- [#7814](https://github.com/electron-userland/electron-builder/pull/7814) [`549d07b0`](https://github.com/electron-userland/electron-builder/commit/549d07b0a04b8686cf4998dc102edad390ddd09a) Thanks [@jgresham](https://github.com/jgresham)! - minor addition to docs for snap publishing. add snapcraft link to local and cd auth options

## 9.2.1

### Patch Changes

- [#7544](https://github.com/electron-userland/electron-builder/pull/7544) [`dab3aeba`](https://github.com/electron-userland/electron-builder/commit/dab3aeba2240ead4300c8fdb35e3d9c16b04a23d) Thanks [@NoahAndrews](https://github.com/NoahAndrews)! - Fix differential downloads when the server compresses the blockmap file HTTP response

## 9.2.0

### Minor Changes

- [#7314](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa) Thanks [@lbestftr](https://github.com/lbestftr)! - added the accelerate option to handle accelerated s3 buckets

### Patch Changes

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

- [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

## 9.2.0-alpha.3

### Patch Changes

- [#7362](https://github.com/electron-userland/electron-builder/pull/7362) [`93930cf0`](https://github.com/electron-userland/electron-builder/commit/93930cf0b04b60896835e1d9feeab20722cd1b98) Thanks [@onucsecu2](https://github.com/onucsecu2)! - docs: replaced 'access token' with 'app password' from BitbucketOptions

## 9.2.0-alpha.2

### Minor Changes

- [#7314](https://github.com/electron-userland/electron-builder/pull/7314) [`cc1ddabd`](https://github.com/electron-userland/electron-builder/commit/cc1ddabd45f239ee06fde9b2d1534467908791fa) Thanks [@lbestftr](https://github.com/lbestftr)! - added the accelerate option to handle accelerated s3 buckets

## 9.1.2-alpha.1

### Patch Changes

- [#7306](https://github.com/electron-userland/electron-builder/pull/7306) [`01c67910`](https://github.com/electron-userland/electron-builder/commit/01c679107435c6afd0b2de8c44d3f140d20c5577) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies per audit/outdated

## 9.1.2-alpha.0

### Patch Changes

- [#7214](https://github.com/electron-userland/electron-builder/pull/7214) [`53327d51`](https://github.com/electron-userland/electron-builder/commit/53327d51101b83641ece9f497577c3ac93d3e91d) Thanks [@mmaietta](https://github.com/mmaietta)! - chore(dep): upgrading typescript and eslint dependencies

## 9.1.1

### Patch Changes

- [#7094](https://github.com/electron-userland/electron-builder/pull/7094) [`1023a93e`](https://github.com/electron-userland/electron-builder/commit/1023a93e92eaa26bf33b52edda5b22e56ed1ec18) Thanks [@HppZ](https://github.com/HppZ)! - fix: close file stream when error

## 9.1.0

### Minor Changes

- [#7028](https://github.com/electron-userland/electron-builder/pull/7028) [`e7179b57`](https://github.com/electron-userland/electron-builder/commit/e7179b57bdba192acfdb439c03099e6629e98f6a) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding timeout to publisher config for api requests and uploads

## 9.0.3

### Patch Changes

- [#6983](https://github.com/electron-userland/electron-builder/pull/6983) [`adeaa347`](https://github.com/electron-userland/electron-builder/commit/adeaa347c03b8947b0812ecef23398c0822646bb) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: regenerate schema.json for `x64ArchFiles` in mac universal options

## 9.0.2

### Patch Changes

- [#6813](https://github.com/electron-userland/electron-builder/pull/6813) [`7af4c226`](https://github.com/electron-userland/electron-builder/commit/7af4c226af9f7759092cbd9d2c63d85e0c54ad43) Thanks [@mmaietta](https://github.com/mmaietta)! - chore: Update dependencies and audit

## 9.0.1

### Patch Changes

- [`9a7ed436`](https://github.com/electron-userland/electron-builder/commit/9a7ed4360618e540810337c5f02d99cd2a9b8441) - chore: updating dependency tree

## 9.0.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

## 9.0.0-alpha.0

### Major Changes

- [#6556](https://github.com/electron-userland/electron-builder/pull/6556) [`a138a86f`](https://github.com/electron-userland/electron-builder/commit/a138a86fb7b59098f5dac0c0a6b59c034eb9b222) Thanks [@mmaietta](https://github.com/mmaietta)! - Breaking changes
  Removing Bintray support since it was sunset. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/
  Fail-fast for windows signature verification failures. Adding `-LiteralPath` to update file path to disregard injected wildcards
  Force strip path separators for backslashes on Windows during update process
  Force authentication for local mac squirrel update server

  Fixes:
  fix(nsis): Adding --INPUTCHARSET to makensis. (#4898 #6232 #6259)

  Adding additional details to error console logging

## 8.9.2

### Patch Changes

- [#6400](https://github.com/electron-userland/electron-builder/pull/6400) [`66ca625f`](https://github.com/electron-userland/electron-builder/commit/66ca625f892329fd7bedf52fddc6659ec83b7cd3) Thanks [@jbool24](https://github.com/jbool24)! - refactor: update Bitbucket publisher to have optional config options for Token and Username (Bitbucket Private Repos)

## 8.9.1

### Patch Changes

- [#6333](https://github.com/electron-userland/electron-builder/pull/6333) [`54ee4e72`](https://github.com/electron-userland/electron-builder/commit/54ee4e72c5db859b9a00104179786567a0e977ff) Thanks [@lutzroeder](https://github.com/lutzroeder)! - fix: SnapStoreOptions required properties (#6327)

## 8.9.0

### Minor Changes

- [#6228](https://github.com/electron-userland/electron-builder/pull/6228) [`a9453216`](https://github.com/electron-userland/electron-builder/commit/a94532164709a545c0f6551fdc336dbc5377bda8) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: adding Bitbucket publisher and autoupdater

## 8.8.1

### Patch Changes

- [#6193](https://github.com/electron-userland/electron-builder/pull/6193) [`7f933d00`](https://github.com/electron-userland/electron-builder/commit/7f933d0004a0a5f808a2a1c71dca7362cab2728e) Thanks [@mmaietta](https://github.com/mmaietta)! - fix: adding snapStore to AllPublishOptions so that it properly is generated via `pnpm generate-schema`

## 8.8.0

### Minor Changes

- [#6167](https://github.com/electron-userland/electron-builder/pull/6167) [`f45110cb`](https://github.com/electron-userland/electron-builder/commit/f45110cbf66572d5748d21fc24dc26cabd06f35f) Thanks [@mmaietta](https://github.com/mmaietta)! - feat: Adding Keygen as an official publisher/updater for electron-builder (#6167)

## 8.7.10

### Patch Changes

- a4eae34f: Synchronizing CLI and package.json versions. Updating auto-publish values + changeset generation to be more frictionless

## 8.7.9

### Patch Changes

- 878671d0: Updating patch number as many deps were updated as parted of RenovateBot integration

## 8.7.8

### Patch Changes

- 1272afc5: Initial introduction of changset config
