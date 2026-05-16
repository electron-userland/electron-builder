The top-level [dmg](configuration.md#dmg) key contains set of options instructing electron-builder on how it should build [DMG](https://en.wikipedia.org/wiki/Apple_Disk_Image) (macOS disk image) files.

## When to Use DMG

DMG is the standard distribution format for direct-download macOS apps. Users mount the disk image, drag the app to their Applications folder, and eject the image. Use DMG when:

- Distributing directly from your website or GitHub Releases
- Using [electron-updater](auto-update.md) (the `zip` target also runs alongside DMG)
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

!!! tip "Centering Icons"
    For a 540×380 window with two icons, the standard horizontal positions are x=130 (app) and x=410 (Applications link), both at y=220 (vertically centered).

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
| `UDBZ` | bzip2-compressed | Better compression than UDZO, slower |
| `UDRO` | Read-only, uncompressed | Largest size, fastest to open |
| `UDRW` | Read-write | Only for development/testing |

For most cases, leave `format` at the default `UDZO`. Use `ULFO` if you are targeting macOS 10.11+ and want faster mount times for large apps.

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

!!! note
    The app bundle inside the DMG is always signed (when signing is configured). The `sign` option here refers to signing the DMG container file itself. Signing the DMG is not required for Gatekeeper but may be requested in some enterprise environments.

## Internet-Enabled DMGs

```yaml
dmg:
  internetEnabled: true   # Default: false
```

Internet-enabled DMGs automatically extract their contents and eject after first open. This is an older pattern and is no longer recommended for modern apps.

## DMG License

To display a license agreement when users open the DMG, create license files in your [build resources](configuration.md#directories) directory.

### Single Language

Create `license.txt`, `license.rtf`, or `license.html` in your build resources directory (default: `build/`).

### Multiple Languages

Create files with a language code suffix. For example:

- `license_en.txt` — English
- `license_de.txt` — German
- `license_fr.txt` — French
- `license_ja.txt` — Japanese
- `license_zh_CN.txt` — Simplified Chinese

The displayed license is selected based on the user's macOS language preference. See the [language code reference](https://github.com/meikidd/iso-639-1/blob/master/src/data.js) for supported codes.

### Customizing License Button Labels

Override the default button text (Agree/Disagree/Print/Save) for each language by creating `licenseButtons_LANG_CODE.json` files:

```json
{
  "lang": "English",
  "agree": "Accept",
  "disagree": "Decline",
  "print": "Print",
  "save": "Save",
  "description": "Please read the license agreement below."
}
```

Name the file `licenseButtons_en.json` for English, `licenseButtons_de.json` for German, etc.

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
```

## Troubleshooting

**Icons appear in wrong positions:** The `x` and `y` values in `contents` are absolute pixels from the top-left of the DMG window. Double-check that your coordinates are within the `window.size` bounds.

**Background not appearing:** Ensure the background image exactly matches the `window.size` dimensions. For Retina support, provide a `@2x` version at double the resolution.

**DMG too large:** The default `UDZO` format compresses well. If size is critical, try `UDBZ` for better (slower) compression.

**License not appearing:** Confirm the license file is in the correct build resources directory and has the correct filename format (`license.txt`, `license_en.txt`, etc.).

## Configuration

{!./app-builder-lib.Interface.DmgOptions.md!}
