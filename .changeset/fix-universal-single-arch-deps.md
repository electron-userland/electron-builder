---
"app-builder-lib": patch
---

fix(mac): resolve universal build failure with platform-specific optional dependencies (e.g. `@esbuild/darwin-arm64`)

Node modules are now filtered by their `package.json` `cpu`/`os` constraints against the target arch/platform, so host-installed single-arch binaries are no longer copied into mismatched (or, for universal builds, both) slices. For `universal` macOS builds, any remaining single-arch packages are automatically reported to `@electron/universal` via `singleArchFiles` (merged with `mac.universal.singleArchFiles`) and a warning lists them. This fixes builds aborting with `Detected file "…" that's the same in both x64 and arm64 builds and not covered by the x64ArchFiles rule` (#9865, #9399).
