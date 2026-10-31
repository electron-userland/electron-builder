---
"app-builder-lib": patch
---

fix(cli): fail the build again when `extraMetadata.build` or `extraMetadata.directories` is set (what the old `--em.build` / `--em.directories` flags produced), and give a literal `--em.*` flag the same targeted error, naming `-c` / `-c.directories` and linking to the v27 build-changes migration page
