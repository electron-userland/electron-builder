---
"app-builder-lib": patch
---

fix(cli): a `build` or `directories` key under `extraMetadata` (in the config or with `-c.extraMetadata.*`) fails the build again, as in v26; the 27.0.0 alphas built with `extraMetadata.build` in a one-package project (dropping it) and with `extraMetadata.directories` in a two-package project, or in a one-package project up to alpha.8 (shipping it in the packaged package.json), and failed the other cases with a package.json error. An `em` option passed to the `build()` API gets a targeted error too (on the command line, a literal `--em.build` / `--em.directories` flag still fails as an unknown argument); the `extraMetadata` and `em` errors name `-c` / `-c.directories` and link to the build-changes migration page
