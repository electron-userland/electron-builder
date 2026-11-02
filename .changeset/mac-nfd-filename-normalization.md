---
"app-builder-lib": patch
---

fix(mac): normalize bundle filenames to NFD before code signing. Before, a bundle entry carrying a precomposed (NFC) non-ASCII name — `설명서.txt`, `café.txt`, a nested `앱 Helper.app` — was sealed under that name, and the HFS+ volume in a DMG rewrote it to the decomposed (NFD) form, so every such file became a missing sealed resource and macOS refused to launch the app with "the application is damaged". It passed `codesign --verify` and notarization on the build machine, so it only ever surfaced for whoever installed the app. After, names are decomposed before signing, which matches what the volume stores and keeps the signature valid regardless of `dmg.filesystem`.
