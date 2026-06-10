---
"app-builder-lib": minor
---

Toolset overhaul: ToolsetCustom, split modules, PlatformPackager API cleanup

Introduces first-class support for user-supplied toolset bundles via the new `ToolsetCustom`
interface, consolidates split toolset files into unified `linux.ts` / `windows.ts` / `appimage.ts`
/ `custom.ts` modules, upgrades toolset default versions, and cleans up the `PlatformPackager` API.
