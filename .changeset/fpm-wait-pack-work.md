---
"app-builder-lib": patch
---

fix(linux): deb/rpm/pacman write `app-update.yml`, `package-type` and `apparmor-profile` into the app directory they package (another arch's with `linux.defaultArch` set before), after waiting for the tar.*/zip/7z archive of that directory, so those archives never pick up the files halfway
