---
"app-builder-lib": major
---

fix(linux): remove `http-parser` from the default pacman `depends` list. The package no longer exists in the official Arch Linux repositories (it is AUR-only since Node.js switched to llhttp), so packages built with the default configuration failed to install on stock Arch Linux and Manjaro with an unresolvable dependency — while `ldd` shows Electron apps have no runtime dependency on it (#9429). Users who genuinely need `http-parser` can restore it by setting `linux.depends` explicitly (note that doing so replaces the entire default list).
