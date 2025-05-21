---
"dmg-builder": patch
---

fix(dmg): --force unmount dmg using hdiutil after 3sec delay when receiving error code 16 (resource is busy)
