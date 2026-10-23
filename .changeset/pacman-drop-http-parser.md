---
"app-builder-lib": major
---

fix(linux): remove `http-parser` from the default pacman `depends` list. The package no longer exists in the official Arch Linux repositories (it is AUR-only since Node.js switched to llhttp), so packages built with the default configuration failed to install on stock Arch Linux and Manjaro with an unresolvable dependency — while `ldd` shows Electron apps have no runtime dependency on it (#9429). Every remaining entry in the default pacman list was verified to still resolve from the official Arch repositories (`libappindicator-gtk3` resolves via the `provides` of the official `libappindicator` package in `extra`), so no other entry was removed.

feat(linux): support the `"default"` keyword in `depends` for the fpm targets (`deb`, `rpm`, `pacman`), mirroring the snap target's `plugs`/`stagePackages`/`buildPackages` convention. `"default"` expands in place to the target's default depends list, so extras can be appended without repeating the defaults — e.g. `["default", "http-parser"]` restores `http-parser` on top of the defaults. The final list is deduplicated.
