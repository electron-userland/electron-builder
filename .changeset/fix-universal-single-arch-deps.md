---
"app-builder-lib": patch
---

fix(mac): resolve universal build failure with platform-specific single-arch dependencies (e.g. esbuild, `@esbuild/darwin-arm64`)

Node modules are now filtered by their `package.json` `cpu`/`os` constraints against the target arch/platform, so host-installed single-arch binaries are no longer copied into mismatched single-arch builds. For `universal` macOS builds, both slices are kept symmetric and any single-arch binary that can't be lipo-merged — including host binaries inside packages that declare no `cpu`/`os` (such as esbuild's `bin/esbuild`) — is automatically reported to `@electron/universal` via `singleArchFiles` (merged with `mac.universal.singleArchFiles`), with a warning listing them. This fixes builds aborting with `Detected file "…" that's the same in both x64 and arm64 builds and not covered by the x64ArchFiles rule` (#9865, #9399).
