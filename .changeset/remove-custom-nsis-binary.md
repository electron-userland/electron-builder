---
"app-builder-lib": major
"electron-builder": patch
---

feat!: remove `customNsisBinary` / `customNsisResources` in favour of `toolsets.nsis` and `installerDebugLogging`; hint `--config` in `migrate-schema`

v27 had stopped using a custom NSIS bundle set via `nsis.customNsisBinary` (also on `nsisWeb` / `portable`) or `customNsisResources` and silently built with the default NSIS. Both keys and the exported `CustomNsisBinary` type are now removed, and a config that sets them fails the build with a message naming the replacement:

- a custom NSIS build moves to `toolsets.nsis: { url, checksum, version }`. The url works as before, but the checksum must be recomputed as the lowercase hex SHA-256 of the archive: the base64 SHA-512 v26 configs typically used is no longer accepted (see https://www.electron.build/docs/toolsets#custom-toolset-checksum). The bundle must contain the NSIS plugins (`plugins/` or `windows/Plugins/`), which v26 read from a separate resources bundle
- `customNsisBinary.debugLogging` becomes `nsis.installerDebugLogging` (also on `nsisWeb`). It needs a log-enabled NSIS (`makensis` and stubs compiled with `NSIS_CONFIG_LOG=yes`), which the bundled `toolsets.nsis` versions are not, so setting it without a custom `toolsets.nsis` now fails with a configuration error instead of a `LogSet` error from `makensis`

`electron-builder migrate-schema` (static and JS/TS configs) moves `debugLogging` to `installerDebugLogging` (dropping it, with a warning, for `portable`, where it had no effect) and removes a `customNsisBinary` that sets nothing else. It leaves a custom bundle in place and warns, without printing its url or checksum, because it cannot convert the checksum.

Any custom toolset (`toolsets.<name>: { url, checksum }`) with a checksum that is not a SHA-256 hex value, such as a v26-style base64 SHA-512, now fails with a configuration error linking to https://www.electron.build/docs/toolsets#custom-toolset-checksum before anything is downloaded, instead of a generic checksum mismatch afterwards. An uppercase hex value is lowercased.

When `migrate-schema` finds no config, its error now lists every auto-detected file name (including `electron-builder.mjs`) and says that a config file with another name needs `--config <path>`.
