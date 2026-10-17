---
"app-builder-lib": minor
---

feat(snap): `"default"` in `snapcraft.core24.plugs` now merges the remaining entries into the full default plug set (including `browser-support` and, without the `gnome` extension, the content-snap plugs), deduplicated by name, with descriptor objects overriding a default plug's attributes
