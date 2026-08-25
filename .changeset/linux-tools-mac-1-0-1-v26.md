---
"app-builder-lib": patch
---

fix(linux): bump linux-tools-mac toolset to 1.0.1 so its binaries run on macOS 15+ instead of requiring macOS 26 (fixes fpm-based deb/rpm/pacman builds on older macOS hosts)
