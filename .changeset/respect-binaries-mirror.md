---
"app-builder-lib": patch
---

fix: respect electron_builder_binaries_mirror in downloadArtifact

downloadArtifact() was ignoring electron_builder_binaries_mirror and falling back
to electron_mirror due to @electron/get behavior. This affected dmg-builder
(macOS) and appimage-tools (Linux) downloads.

- Extract getBinariesMirrorUrl() to share mirror URL resolution
- Use the helper in both downloadArtifact() and getBinFromUrl()
- Ensure custom mirrors are respected for all binary downloads
