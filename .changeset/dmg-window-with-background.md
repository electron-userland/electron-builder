---
"dmg-builder": patch
---

fix(dmg): honor `dmg.window` when a background image is set. Before, the window position and size were always taken from the background image and `dmg.window` was silently ignored. After, any `x`, `y`, `width` or `height` you set overrides the background-derived default. This lets you make the window taller than the background to account for the Finder title bar, which is included in the window frame and otherwise crops the bottom of the image.
