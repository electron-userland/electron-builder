---
"app-builder-lib": patch
---

fix(mac): bump icons toolset to 1.2.3 so small ICNS sizes are written as ic04/ic05 ARGB instead of PNG-in-icp4/icp5/icp6, which macOS renders as noise at 16/32px (fixes corrupted Finder/DMG icons)
