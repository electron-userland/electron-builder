---
"docker": major
---

feat(docker)!: publish the images to the GitHub Container Registry as `ghcr.io/electron-userland/builder` instead of Docker Hub's `electronuserland/builder`, which is no longer updated, with a signed build provenance attestation per image. The dated tags (`<image>-MM.YY`, e.g. `22-wine-mono-10.26`) are replaced by tags with the version of this package (`<image>-<version>`, e.g. `22-wine-mono-27.0.0`), which are immutable: a deploy never overwrites a versioned tag. The moving tags (`<node>`, `<node>-wine`, `latest`, `wine`, …) are unchanged
