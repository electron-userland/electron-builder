---
"dmg-builder": patch
---

fix(dmg): find the mounted volume path in `hdiutil attach` output in linear time (a whitespace-only volume name is no longer taken as `/Volumes/`)
