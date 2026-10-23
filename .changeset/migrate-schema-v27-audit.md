---
"electron-builder": minor
"app-builder-lib": patch
---

feat(migrate-schema): cover every v27 breaking config change

`electron-builder migrate-schema` (static and JS/TS configs) now also rewrites the v26 shapes it previously left behind, which failed v27 schema validation on the next build:

- platform-level `mac`/`mas`/`masDev`/`win`/`linux` `asarUnpack` → `<platform>.asar.unpack`, merging the root ASAR options in because a platform-level `asar` replaces the root one in v27; root ASAR keys that have no effect under `asar: false` are removed
- `toolsets.*: null` entries are removed and the retired `toolsets.appimage: "1.0.2"` pin becomes `"1.0.3"`
- `nativeRebuilder: "legacy"`, `electronDownload.force`, and v26 `null` ("unset") values on `mac.type` / `provisioningProfile` / `binaries` / `signIgnore` / `singleArchFiles` / `x64ArchFiles` are dropped instead of carried into keys that reject them; a hand-renamed `electronGet` still in the v26 shape is reshaped
- GitHub publish entries are migrated in every section (e.g. `nsis.publish`), a non-empty `tagNamePrefix` next to `vPrefixedTagName` is kept (it won in v26), and an empty `tagNamePrefix` — ignored by v26 — becomes `"v"` with a warning so existing tag names do not change
- `win.signAndEditExecutable: false` also maps to `win.sign: false` (it skipped signing in v26), and `win.signtoolOptions` / `win.azureSignOptions` under disabled signing are dropped with a warning instead of producing an invalid config
- `snap` options the `snapcraft.core24` shape does not support are dropped with a warning

It warns about `squirrelWindows.customSquirrelVendorDir` (not mechanically migratable) and prints an advisory for `mac`/`mas`/`masDev` configs that rely on the tightened default entitlements. The build-time legacy-config guard now also names `squirrelWindows.customSquirrelVendorDir` and `electronGet.force`, and the `USE_SYSTEM_WINE` removal message points at `toolsets.wine: "system"`.
