---
"app-builder-lib": patch
---

fix: extracting a downloaded `.zip` (Electron, custom `electronDist` archives, toolsets) checks every write by real path, so symlinks inside the archive can no longer chain together to write outside the extraction directory, and a file is never written through a symlink that already sits at its destination
