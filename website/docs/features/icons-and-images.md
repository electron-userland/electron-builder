---
title: "Icons & Images"
---

electron-builder handles icon and image assets differently per platform. Give it a single high-quality source — a 1024×1024 PNG or an SVG — and it auto-converts to every format the target platform needs. No manual export pipelines, no platform-specific tooling required.

## TL;DR — Recommended build/ layout

```
build/
├── icon.png            ← your master icon (1024×1024 or SVG)
├── icon.icns           ← optional: pre-built macOS icon
├── icon.ico            ← optional: pre-built Windows icon
├── background.png      ← macOS DMG background (540×380 px)
├── background@2x.png   ← Retina DMG background (1080×760 px)
└── icons/              ← optional: manual Linux PNG set
    ├── 16x16.png
    ├── 32x32.png
    └── 512x512.png
```

---

## Application Icon

The application icon is the one that appears in the Dock, taskbar, Start menu, and application menus. electron-builder resolves it in this order:

1. The explicit `mac.icon`, `win.icon`, or `linux.icon` config path
2. `icon.<format>` (e.g. `icon.icns` for macOS, `icon.ico` for Windows)
3. `icon.png`
4. `icon.icns` (as a fallback source for all platforms)
5. Named icon files in `build/icons/`

### Format & size requirements

| Platform | Accepted formats | Minimum | Recommended |
|---|---|---|---|
| macOS | `.icon`, `.icns`, `.png`, `.svg` | 512×512 | 1024×1024 |
| Windows | `.ico`, `.png`, `.svg` | 256×256 | 512×512 |
| Linux | PNG directory, `.png`, `.svg` | 256×256 | 1024×1024 |

:::tip
A single 1024×1024 `icon.png` covers all three platforms. electron-builder converts it automatically.
:::

---

## SVG Support

SVG is supported as an input format for all three platforms — **including ICNS and ICO** generation. SVGs are rasterized to 1024×1024 pixels before conversion, providing clean headroom for all target sizes.

```yaml
mac:
  icon: build/icon.svg

win:
  icon: build/icon.svg
```

**Linux:** For the `set` format, SVG source files are passed through directly to the freedesktop icon hierarchy under `scalable/`, where desktop environments can render them at any scale. This is ideal for HiDPI/fractional-scaling desktops.

---

## macOS Icon Sizes (ICNS)

When converting a PNG or SVG to `.icns`, electron-builder generates these Apple OSType entries:

| OSType code | Size | Notes |
|---|---|---|
| `icp4` | 16×16 | Small icon |
| `ic11` | 32×32 | |
| `ic12` | 64×64 | |
| `ic07` | 128×128 | |
| `ic08` / `ic13` | 256×256 | Standard Retina |
| `ic09` / `ic14` | 512×512 | Large Retina |
| `ic10` | 1024×1024 | Full Retina |

:::note
If you provide a pre-built `.icns`, electron-builder uses it as-is — no re-encoding.
:::

### macOS `.icon` format (Asset Catalog)

If you set `mac.icon` to a `.icon` file (Apple Icon Composer asset), electron-builder compiles it into an `Assets.car` via `actool` and wires it via `CFBundleIconName`. This requires **Xcode 26+** and **macOS 15+** on the build machine.

For `.icns` files, the path is referenced via `CFBundleIconFile` and does not require Xcode.

---

## Linux Icon Set

electron-builder generates a full set of PNG icons for Linux, named `icon_NxN.png`, at these standard sizes:

| Size | Target directories |
|---|---|
| 16×16 | `hicolor/16x16/apps/` |
| 24×24 | `hicolor/24x24/apps/` |
| 32×32 | `hicolor/32x32/apps/` |
| 48×48 | `hicolor/48x48/apps/` |
| 64×64 | `hicolor/64x64/apps/` |
| 128×128 | `hicolor/128x128/apps/` |
| 256×256 | `hicolor/256x256/apps/` |
| 512×512 | `hicolor/512x512/apps/` |

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

The DMG installer window background image. The window dimensions match the image dimensions, so getting this right ensures your DMG looks polished.

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

The path must be a directory containing `icon-tool.js` and `resvg.wasm`.

---

## Source Resolution Details

When you specify `icon: build/icon` (no extension), electron-builder searches for your icon in this order for each target format:

1. `build/icon.<format>` (e.g. `build/icon.icns` for macOS)
2. `build/icon` (exact path as a directory)
3. `build/icon.png`
4. `build/icon.icns` (cross-platform fallback)
5. `build/icon.ico`

ICNS files can be used as a source for all platforms: electron-builder extracts the largest embedded PNG frame and converts from there.
