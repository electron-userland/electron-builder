---
"app-builder-lib": patch
---

fix(flatpak): stop the shared `linux.files` option from leaking into the flatpak-specific `files` copy-tuple list (which crashed builds with `ENOENT ... stat '<project>/*'`)
