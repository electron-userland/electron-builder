---
"app-builder-lib": patch
---

fix(flatpak): read `flatpak.files` from the flatpak config directly so that a single-string or FileSet `linux.files` no longer throws in FlatpakTarget
