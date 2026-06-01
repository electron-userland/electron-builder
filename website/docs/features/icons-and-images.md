---
title: "Icons & Images"
---

electron-builder handles icon and image assets differently per platform. Give it a single high-quality source — a 1024×1024 PNG or an SVG — and it auto-converts to every format the target platform needs. No manual export pipelines, no platform-specific tooling required.

All icon and image files are **optional** — if omitted, the default Electron icon is used. Files are resolved from the [`buildResources`](../contents.md#extraresources) directory, which defaults to `build/` in your project root.

:::tip[Icon creation tools]
[Icon Composer](https://developer.apple.com/icon-composer/), [AppIcon Generator](http://www.tweaknow.com/appicongenerator.php), [MakeAppIcon](https://makeappicon.com/)
:::

## TL;DR — Recommended build/ layout

```
build/
├── icon.svg            ← master icon (SVG — scales perfectly to all sizes)
├── icon.png            ← or use PNG (1024×1024 recommended)
├── icon.icns           ← optional: pre-built macOS icon (skips conversion)
├── icon.ico            ← optional: pre-built Windows icon (skips conversion)
├── background.png      ← macOS DMG background (540×380 px)
├── background@2x.png   ← Retina DMG background (1080×760 px)
└── icons/              ← optional: manual Linux PNG set
    ├── 16x16.png
    ├── 32x32.png
    └── 512x512.png
```

A single `icon.svg` or `icon.png` in your `build/` directory is enough to cover all three platforms — electron-builder discovers and converts it automatically.

---

## Application Icon

The application icon appears in the Dock, taskbar, Start menu, and application menus. electron-builder searches for your icon in this order:

1. The explicit `mac.icon`, `win.icon`, or `linux.icon` config path
2. `icon.<format>` (e.g. `icon.icns` for macOS, `icon.ico` for Windows)
3. `icon.png`
4. `icon.svg` — auto-discovered, no config required
5. `icon.icns` (cross-platform source for ICNS-based conversion)
6. A directory named `icons/` or `icon/`

### Format & size requirements

| Platform | Accepted input formats | Minimum | Recommended |
|---|---|---|---|
| macOS | `.svg`, `.png`, `.icns`, `.icon` | 512×512 | 1024×1024 (or SVG) |
| Windows | `.svg`, `.png`, `.ico` | 256×256 | 512×512 (or SVG) |
| Linux | `.svg`, `.png`, directory of PNGs | 256×256 | SVG or 1024×1024 PNG |

:::tip[SVG is best]
SVG icons are rasterized at 1024px before conversion, giving every generated size a clean starting point. Use SVG when your icon is available in vector form.
:::

---

## SVG Support

SVG is supported as an input format for all three platforms. Place `icon.svg` in your `build/` directory and electron-builder finds it automatically — no `mac.icon` or `win.icon` config required.

- **macOS / Windows**: The SVG is rasterized to 1024×1024 before ICNS or ICO conversion.
- **Linux (`set` format)**: The SVG is passed through directly to the freedesktop `scalable/` icon hierarchy. Desktop environments render it at any scale — ideal for HiDPI and fractional-scaling displays.

Explicit config also works:

```yaml
mac:
  icon: build/icon.svg

win:
  icon: build/icon.svg
```

---

## macOS Icon Sizes (ICNS)

When converting to `.icns`, electron-builder generates all standard Apple icon sizes:

| Size | Usage |
|---|---|
| 16×16 | Finder list view |
| 32×32 | Finder column view, Retina 16px |
| 64×64 | Retina 32px |
| 128×128 | Finder preview |
| 256×256 | Standard Retina |
| 512×512 | Large Retina |
| 1024×1024 | Full Retina (macOS 10.7+) |

All sizes are generated from the input regardless of the source dimensions — SVG sources and large PNGs produce the sharpest results at every size.

:::note
If you provide a pre-built `.icns`, electron-builder uses it as-is — no re-encoding.
:::

### macOS `.icon` format (Asset Catalog)

If you set `mac.icon` to a `.icon` file (Apple Icon Composer asset), electron-builder compiles it into an `Assets.car` via `actool` and wires it via `CFBundleIconName`. This requires **Xcode 26+** and **macOS 15+** on the build machine.

For `.icns` files, the path is referenced via `CFBundleIconFile` and does not require Xcode.

:::note
If you only provide a `.icon` file and rely on the default DMG volume icon, consider setting `dmg.icon` explicitly to an `.icns` file — the DMG volume icon still uses `.icns`.
:::

---

## Linux Icon Set

electron-builder generates a full set of PNG icons for Linux, named `icon_NxN.png`, at these standard sizes:

| Size | Freedesktop target directory |
|---|---|
| 16×16 | `hicolor/16x16/apps/` |
| 24×24 | `hicolor/24x24/apps/` |
| 32×32 | `hicolor/32x32/apps/` |
| 48×48 | `hicolor/48x48/apps/` |
| 64×64 | `hicolor/64x64/apps/` |
| 128×128 | `hicolor/128x128/apps/` |
| 256×256 | `hicolor/256x256/apps/` |
| 512×512 | `hicolor/512x512/apps/` |

SVG sources are placed in `scalable/` instead and are not resized.

To provide a pre-built Linux set, create a directory and name each PNG with its pixel dimensions:

```yaml
linux:
  icon: build/icons/
```

```
build/icons/
├── 16x16.png
├── 32x32.png
├── 48x48.png
├── 128x128.png
├── 256x256.png
└── 512x512.png
```

Files must match the pattern `NxN.png` or `N.png` (e.g., `256x256.png` or `512.png`). Files with incidental digits in their names (e.g., `app2.png`) are ignored.

---

## macOS DMG Background

The DMG installer window background image. The window dimensions match the image dimensions — getting this right ensures your DMG looks polished.

| Asset | Dimensions | Location |
|---|---|---|
| Standard background | **540×380 px** | `build/background.png` or `build/background.tiff` |
| Retina background | **1080×760 px** | `build/background@2x.png` |
| Volume icon | `.icns` | `build/icon.icns` (or `dmg.icon`) |

```yaml
dmg:
  background: build/background.png
  backgroundColor: "#ffffff"   # fallback if no background image
  icon: build/dmg-icon.icns    # volume badge icon (optional)
  iconSize: 80
  iconTextSize: 12
```

Supply both `background.png` and `background@2x.png` for crisp rendering on Retina displays.

---

## Windows NSIS Installer Images

The NSIS installer has two visual modes:

- **One-click installer** — minimal UI, only uses the app icon
- **Assisted installer** — a wizard with a sidebar and header banner

### Assisted installer assets

| Asset | Dimensions | Format | Location |
|---|---|---|---|
| Installer header banner | **150×57 px** | `.bmp` | `build/installerHeader.bmp` |
| Installer sidebar | **164×314 px** | `.bmp` | `build/installerSidebar.bmp` |
| Uninstaller sidebar | **164×314 px** | `.bmp` | `build/uninstallerSidebar.bmp` |
| Installer icon | `.ico` | | `build/installerIcon.ico` |
| Uninstaller icon | `.ico` | | `build/uninstallerIcon.ico` |

```yaml
nsis:
  installerHeader: build/installerHeader.bmp
  installerSidebar: build/installerSidebar.bmp
  uninstallerSidebar: build/uninstallerSidebar.bmp
  installerIcon: build/installerIcon.ico
  uninstallerIcon: build/uninstallerIcon.ico
```

:::note
BMP files must be 24-bit RGB (no alpha). Use any image editor to export in this format.
:::

---

## Windows AppX (Microsoft Store) Tile Images

AppX packages require a set of tile images for the Windows Start screen and Store listing. Place them in `build/appx/`:

| Asset | Dimensions | Filename |
|---|---|---|
| Store logo | **50×50 px** | `StoreLogo.png` |
| Small tile | **44×44 px** | `Square44x44Logo.png` |
| Medium tile | **150×150 px** | `Square150x150Logo.png` |
| Wide tile | **310×150 px** | `Wide310x150Logo.png` |

All AppX images must be PNG with transparency support. Microsoft recommends providing 1x, 1.25x, 1.5x, 2x, and 4x scale variants using the naming convention `Square44x44Logo.scale-200.png` (for 2x), but electron-builder only requires the base filenames listed above.

See the [AppX configuration](../appx.md) page for the full set of AppX options, including custom manifest support.

---

## Icons Toolset

electron-builder bundles a portable icon conversion toolset (`icon-tool.js` + `resvg.wasm`) that handles all PNG/SVG → ICNS/ICO/set conversions without native dependencies. The toolset is downloaded automatically on first use and cached in the electron-builder cache directory.

**Override with a local bundle** (useful for offline builds or development):

```bash
ELECTRON_BUILDER_ICONS_TOOLSET_PATH=/path/to/icons-bundle pnpm build
```

The path must point to a directory containing `icon-tool.js` and `resvg.wasm`.

---

## Source Resolution Reference

When you specify `icon: build/icon` (no extension), electron-builder probes the following paths for each target format:

| Priority | Probe path | Notes |
|---|---|---|
| 1 | `build/icon.<format>` | e.g. `icon.icns` for macOS |
| 2 | `build/icon` | exact path |
| 3 | `build/icon.png` | |
| 4 | `build/icon.svg` | auto-discovered; converted on the fly |
| 5 | `build/icon.icns` | used as PNG source for non-ICNS targets |
| 6 | `build/icons/` or `build/icon/` | directory of pre-sized PNGs |
| 7 | `build/icon.ico` | used as source for ICO targets |

ICNS files can be used as a source for all platforms — electron-builder extracts the largest embedded PNG frame and converts from there.
