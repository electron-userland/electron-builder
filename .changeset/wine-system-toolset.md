---
"app-builder-lib": major
---

feat(toolsets)!: `toolsets.wine` defaults to the host `wine` on `PATH`; adds the explicit `"system"` value

BREAKING: `toolsets.wine` unset / `null` / `"latest"` now resolves to `"system"` — the host-installed `wine` on `PATH` — on macOS as well as Linux. macOS previously downloaded the Wine 11.0 bundle, so a macOS host building Windows targets now needs Wine installed (`brew install --cask wine-stable`). Set `toolsets.wine: "1.0.1"` to keep the downloaded bundle.

This restores the capability of the `USE_SYSTEM_WINE` env var removed in v27. `ToolsetCustom` was documented as the replacement but cannot point at a stock Wine installation: `createWineEnvironment` requires the toolset directory to contain a prebuilt `wine-home` prefix next to `bin/` and `lib/`, which no real Wine install has.

fix(msi): only emit `Icon="…"` on shortcuts and ProgIds when the app has an icon

The MSI template declares `<Icon Id="…"/>` only when `iconPath` is set, but `MsiTarget` referenced that id unconditionally, so building an MSI for an app without an icon failed in `light.exe` with `LGHT0094: The identifier 'Icon:<Product>Icon.exe' could not be found`.
