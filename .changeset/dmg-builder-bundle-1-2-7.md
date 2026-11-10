---
"dmg-builder": patch
---

fix(mac): use the `dmg-builder@1.2.7` dmgbuild bundle (`dmgbuild-bundle-<arch>-cc96fa2.tar.gz`). It ships Python 3.14.10 and an OpenSSL 3.5.9 built for macOS 11, so the whole bundled runtime now really runs on macOS 11 and later (the 1.2.5 bundle's `libssl`/`libcrypto` required macOS 15), and dmgbuild's default `--detach-retries` goes from 5 to 12. The bundle also includes the license files for Python, OpenSSL, dmgbuild and its other bundled components under `LICENSES/`
