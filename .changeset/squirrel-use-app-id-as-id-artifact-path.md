---
"electron-builder-squirrel-windows": patch
---

fix(squirrel-windows): derive the emitted `*-full.nupkg` / `*-delta.nupkg` artifact paths from the nuspec id, so they point at the files Squirrel actually produces when `useAppIdAsId` is set
