---
"app-builder-lib": patch
---

fix(cli): a `build` or `directories` key under `extraMetadata` fails the build, and a literal `--em.build` / `--em.directories` flag gets a targeted error too; both errors name `-c` / `-c.directories` and link to the build-changes migration page
