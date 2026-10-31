---
"app-builder-lib": major
---

fix(cli): fail the build again when `extraMetadata.build` or `extraMetadata.directories` is set (what the old `--em.build` / `--em.directories` flags produced), with an error that names `-c` / `-c.directories` and links to the v27 build-changes migration page
