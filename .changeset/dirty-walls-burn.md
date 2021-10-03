---
"app-builder-lib": patch
---

The filename of the app icon in macOS is now always 'icon.icns' instead of a derivate of the product name. The reason for this change is that macOS doesn't display icons with non-ASCII characters in their names, which is quite possible in languages other than English.
