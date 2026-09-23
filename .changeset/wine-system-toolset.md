---
"app-builder-lib": minor
---

feat(toolsets)!: add `toolsets.wine: "system"` and make it what `"latest"` resolves to

`"system"` runs Windows tools with the host `wine` on `PATH`, restoring the capability of the `USE_SYSTEM_WINE` env var removed in v27. The host-wine branch already existed but was reachable only on Linux, so macOS had no way to opt out of the downloaded bundle: `ToolsetCustom` requires the directory to contain a prebuilt `wine-home` prefix, which a real Wine installation does not have.

**Behaviour change:** `"latest"` — the default — now resolves to `"system"` rather than the `"1.0.1"` bundle, so building a Windows target on macOS requires Wine to be installed (`brew install --cask wine-stable`). The published `wine@1.0.1` bundles ship no PE builtins (`lib/wine/<arch>-windows` is deleted at package time), so they cannot execute any Windows binary; `toolsets.wine: "1.0.1"` still resolves and downloads for anyone pinning it explicitly. Linux already defaulted to the host Wine.

fix(msi): only emit `Icon="…"` on shortcuts and ProgIds when the app has an icon

The MSI template declares `<Icon Id="…"/>` only when `iconPath` is set, but `MsiTarget` referenced that id unconditionally, so building an MSI for an app without an icon failed in `light.exe` with `LGHT0094: The identifier 'Icon:<Product>Icon.exe' could not be found`.
