---
"app-builder-lib": major
"dmg-builder": major
---

feat(dmg): default DMG `filesystem` to APFS

BREAKING CHANGE: The default DMG volume filesystem changed from `HFS+` to `APFS`. APFS is the modern macOS filesystem and produces smaller, faster-to-mount images on current macOS. If you must support pre-10.13 (High Sierra) macOS, which cannot mount APFS volumes, set `dmg.filesystem: "HFS+"` explicitly.
