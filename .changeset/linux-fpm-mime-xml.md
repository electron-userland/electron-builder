---
"app-builder-lib": patch
---

fix(linux): escape the MIME type XML that deb, rpm and pacman install for file associations, using the same builder as AppImage and Flatpak. Multi-dot globs such as `tar.gz` are kept, and the deb/rpm/pacman `<comment>` is written only when `description` is set
