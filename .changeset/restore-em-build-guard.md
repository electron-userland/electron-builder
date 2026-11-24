---
"app-builder-lib": patch
---

fix(cli): a `build` or `directories` key under `extraMetadata` fails the build, and an `em` option passed to the `build()` API gets a targeted error too (on the command line, a literal `--em.build` / `--em.directories` flag still fails as an unknown argument); both errors name `-c` / `-c.directories` and link to the build-changes migration page
