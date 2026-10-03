---
"electron-builder": patch
"app-builder-lib": patch
---

fix(migrate-schema): hint `--config` for custom-named config files and warn on the ignored v26 custom NSIS binary

When `electron-builder migrate-schema` finds no config, its error now lists every auto-detected file name (including `electron-builder.mjs`) and says that a config file with another name needs `--config <path>`.

v27 ignores the `url` / `checksum` / `version` of `nsis.customNsisBinary` (also on `nsisWeb` / `portable`) and `customNsisResources`, and builds with the default NSIS bundle. The build now warns once about these settings, and `migrate-schema` (static and JS/TS configs) warns without rewriting them, because the replacement, `toolsets.nsis`, needs a lowercase SHA-256 hex checksum instead of the base64 SHA-512 v26 also accepted and a bundle that contains the NSIS plugins. The warnings never print the configured values.
