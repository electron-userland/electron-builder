---
"app-builder-lib": minor
---

feat(blockmap): chunk the stored `resources/app.asar` region with finer content-defined blocks (4/8/16 KiB) than the rest of the artifact (v26 backport of #10235). With `nsis.differentialPackage: "store-asar"`, the asar sits uncompressed in the package and in the signed installer, so its byte range is now chunked on its own parameters instead of the 8/16/32 KiB default used everywhere else — a one-line app-code change costs 5–17% fewer bytes on the wire (measured on a ~32 MB asar). The blockmap format is unchanged and every shipped electron-updater reads it exactly as before; when the asar bytes cannot be located in the package the build logs a warning and falls back to default chunking rather than failing.

Note for apps already shipping `"store-asar"` (available in v26 since #10201): the block boundaries inside the asar region change once. The first differential update from an installer built without this change to one built with it re-downloads close to the whole asar; updates between installers built with it get the smaller deltas.
