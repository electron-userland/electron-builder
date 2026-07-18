---
title: "DMG"
---

The top-level [dmg](configuration.md) key contains a set of options instructing electron-builder on how it should build [DMG](https://en.wikipedia.org/wiki/Apple_Disk_Image) (macOS disk image) files.

## When to Use DMG

DMG is the standard distribution format for direct-download macOS apps. Users mount the disk image, drag the app to their Applications folder, and eject the image. Use DMG when:

- Distributing directly from your website or GitHub Releases
- Using [electron-updater](features/auto-update.md) (the `zip` target also runs alongside DMG)
- You want the most familiar macOS install experience

For Mac App Store distribution, see [MAS](mas.md). For system-level installs (kernel extensions, launch daemons), see [PKG](pkg.md).

## Window Customization

The `window` option controls the Finder window that appears when the DMG is mounted:

```yaml
dmg:
  window:
    position:
      x: 130
      y: 220
    size:
      width: 540
      height: 380
```

Standard DMG windows are 540×380 pixels. The position coordinates place the window on screen — `x: 130, y: 220` is a common convention.

## Background Image

Set a background image to make your DMG installer look polished:

```yaml
dmg:
  background: build/background.png
```

**Requirements:**
- Format: PNG (recommended for quality and transparency support)
- Size: match your `window.size` — typically 540×380 pixels
- For Retina displays: provide a `@2x` version at 1080×760 and name it `background@2x.png`. electron-builder will automatically use the high-resolution version on Retina screens.

If no background image is set, use `backgroundColor` to set a solid color:

```yaml
dmg:
  backgroundColor: "#2c2c2c"
```

## Icon Layout

The `contents` array defines the position and type of icons inside the DMG window. A typical layout has the app icon on the left and a `/Applications` shortcut on the right:

```yaml
dmg:
  contents:
    - x: 130
      y: 220
      type: file
    - x: 410
      y: 220
      type: link
      path: /Applications
```

| Field | Description |
|---|---|
| `x`, `y` | Position in the DMG window (pixels from top-left) |
| `type` | `file` — the app itself; `link` — a symlink (e.g., to `/Applications`) |
| `path` | Only for `link` type — the symlink destination |
| `name` | Optional display name override |

:::tip[Centering Icons]
For a 540×380 window with two icons, the standard horizontal positions are x=130 (app) and x=410 (Applications link), both at y=220 (vertically centered).
:::

## Volume Icon and Title

The DMG volume appears in the macOS Finder sidebar when mounted. Customize its appearance:

```yaml
dmg:
  # Badge icon shown in Finder when the DMG is mounted
  badgeIcon: build/icon.icns

  # Volume icon (what appears as the disk image itself in Finder)
  icon: build/volume-icon.icns

  # Title shown in the Finder window title bar when mounted
  title: "${productName} ${version}"

  # Icon size inside the DMG window
  iconSize: 80

  # Font size for icon labels
  iconTextSize: 12
```

The default `title` is `${productName} ${version}`. The default `iconSize` is 80 pixels.

## Disk Image Format

The `format` option controls the compression algorithm:

| Format | Description | Use Case |
|---|---|---|
| `UDZO` | zlib-compressed (default) | Good balance of size and compatibility |
| `ULFO` | LZFSE-compressed | Faster decompression, macOS 10.11+ only |
| `ULMO` | LZMA-compressed | Best compression, slower to mount, macOS 10.15+ only |
| `UDBZ` | bzip2-compressed | Better compression than UDZO, slower |
| `UDRO` | Read-only, uncompressed | Largest size, fastest to open |
| `UDRW` | Read-write | Only for development/testing |

For most cases, leave `format` at the default `UDZO`. Use `ULFO` if you are targeting macOS 10.11+ and want faster mount times for large apps. Use `ULMO` if you are targeting macOS 10.15+ and want the smallest download — it typically compresses an Electron app's DMG ~30% smaller than `UDZO`, at the cost of a few extra seconds to mount and copy at install time.

## DMG Size

The `size` option sets the initial filesystem size. Normally this is computed automatically — only set it if you encounter errors about insufficient space during DMG creation:

```yaml
dmg:
  size: "500m"
```

Set `shrink: false` to disable automatic shrinking of the DMG to the minimum size after creation (not recommended for production).

## Signing the DMG

The DMG itself can be signed separately from the app bundle inside it:

```yaml
dmg:
  sign: true   # Default: false
```

:::note
The app bundle inside the DMG is always signed (when signing is configured). The `sign` option here refers to signing the DMG container file itself. Signing the DMG is not required for Gatekeeper but may be requested in some enterprise environments.
:::

## Internet-Enabled DMGs

```yaml
dmg:
  internetEnabled: true   # Default: false
```

Internet-enabled DMGs automatically extract their contents and eject after first open. This is an older pattern and is no longer recommended for modern apps.

## DMG License

To display a license agreement when users open the DMG, set the `license` option in your DMG configuration or use the file-naming convention.

### Configuration-based (recommended)

Specify the license file path directly in `electron-builder.yml`:

```yaml
dmg:
  license: "build/license.rtf"
```

For multi-language builds, provide a language-code → file-path map:

```yaml
dmg:
  license:
    en_US: "build/license.rtf"
    de_DE: "build/license_de.txt"
    fr_FR: "build/license_fr.txt"
    ja_JP: "build/license_ja.txt"
    zh_CN: "build/license_zh.txt"
```

Language codes use the `ll_CC` format (ISO 639-1 language code + ISO 3166-1 country code, underscore-separated). The first entry in the map is the fallback shown when the user's language is not present.

Supported file formats: `.rtf` (recommended for rich text), `.txt` (plain text), `.html`.

:::tip[RTF recommended]
Use `.rtf` format for the best cross-language compatibility. Plain `.txt` files for Japanese, Korean, and Simplified/Traditional Chinese require macOS's CJK codec support in the bundled Python runtime.
:::

### File-naming convention (automatic discovery)

As an alternative, place license files in your [build resources](configuration.md) directory using this naming pattern — electron-builder will pick them up automatically:

| Filename | Language |
|---|---|
| `license_en.txt` or `eula_en.txt` | English |
| `license_de.rtf` | German |
| `license_fr.html` | French |
| `license_ja.txt` | Japanese |
| `license_zh_CN.txt` | Simplified Chinese |

The language code is derived from the `_LANG` suffix. The user's macOS language preference determines which license is shown; `en_US` is the fallback.

:::note[One file per language]
Having both `license_en.txt` **and** `eula_en.txt` in the same build resources directory is an error — both map to `en_US` and electron-builder will throw an `InvalidConfigurationError`. Use the config-based `license` map if you need to control which file is used.
:::

### Customizing License Button Labels

Override the default button text (Agree / Disagree / Print / Save) for each language by creating `licenseButtons_LANG.json` or `licenseButtons_LANG.yml` files in your build resources directory:

```json
{
  "languageName": "English",
  "agree": "Accept",
  "disagree": "Decline",
  "print": "Print",
  "save": "Save",
  "message": "Please read the license agreement below."
}
```

Name the file `licenseButtons_en.json` for English, `licenseButtons_de.json` for German, etc. The `message` field sets the prompt text at the top of the dialog. The legacy `description` field is also accepted as an alias for `message`.

## Complete Example

```yaml
dmg:
  background: build/dmg-background.png
  window:
    position:
      x: 130
      y: 220
    size:
      width: 540
      height: 380
  contents:
    - x: 130
      y: 220
      type: file
    - x: 410
      y: 220
      type: link
      path: /Applications
  iconSize: 80
  iconTextSize: 12
  title: "${productName} ${version}"
  format: UDZO
  # Single-language license
  license: "build/license.rtf"
```

Multi-language example:

```yaml
dmg:
  background: build/dmg-background.png
  license:
    en_US: "build/license.rtf"
    de_DE: "build/license_de.txt"
    fr_FR: "build/license_fr.txt"
  window:
    size:
      width: 540
      height: 380
  format: UDZO
```

## Troubleshooting

**Icons appear in wrong positions:** The `x` and `y` values in `contents` are absolute pixels from the top-left of the DMG window. Double-check that your coordinates are within the `window.size` bounds.

**Background not appearing:** Ensure the background image exactly matches the `window.size` dimensions. For Retina support, provide a `@2x` version at double the resolution.

**DMG too large:** The default `UDZO` format compresses well. If size is critical, try `UDBZ` for better (slower) compression.

**License not appearing:** If using the config option, verify the `license` path resolves relative to your build resources directory or project root. If using the file-naming convention, confirm the file is in the build resources directory with the correct pattern (`license_en.txt`, `eula_en.txt`, etc.) and a supported extension (`.rtf`, `.txt`, `.html`).

**"Multiple license files found" error:** You have both `license_en.txt` and `eula_en.txt` (or two files that resolve to the same language code) in your build resources. Remove the duplicate or use the config-based `license` map to point to the exact file you want.

**CJK license not appearing:** Japanese, Korean, and Chinese plain-text licenses require CJK codec support in the dmgbuild Python runtime. Use `.rtf` format for these languages, or ensure your dmgbuild bundle version is `1.2.5` or later.

## Configuration

{!./app-builder-lib.Interface.DmgOptions.md!}
