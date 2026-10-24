---
"app-builder-lib": patch
---

fix(linux): deb/rpm/pacman wait for the tar.*/zip/7z archive of the same app directory and arch before writing `app-update.yml`, `package-type` and `apparmor-profile` into it, so those archives never pick up the files halfway
