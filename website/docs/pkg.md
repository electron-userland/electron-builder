The top-level [pkg](configuration.md) key contains a set of options instructing electron-builder on how it should build macOS [PKG](https://en.wikipedia.org/wiki/Package_(macOS)) product archive installers.

## When to Use PKG

PKG (`.pkg`) files are macOS installer packages that run Apple's native Installer application. Use PKG when:

- **System-level installs are required** — installing launch daemons, kernel extensions (or System Extensions on modern macOS), or files outside `/Applications`
- **Custom install scripts are needed** — pre/postinstall shell scripts run with root privileges during installation
- **Enterprise managed deployment** — PKG integrates with MDM systems and software management tools like Munki, Jamf, and SCCM for macOS
- **Installer UI customization** — displaying welcome screens, license agreements, readme files, and conclusion pages

For standard consumer app distribution, [DMG](dmg.md) is the conventional choice. For Mac App Store distribution, see [MAS](mas.md).

## Certificate Requirements

Signing a PKG file requires a **Developer ID Installer** certificate — this is a different certificate from the **Developer ID Application** certificate used to sign the app bundle inside the PKG.

```yaml
pkg:
  identity: "Developer ID Installer: My Company (TEAM1234AB)"
```

Or use the `CSC_INSTALLER_LINK` and `CSC_INSTALLER_KEY_PASSWORD` environment variables in CI.

:::tip
You can have both `Developer ID Application` and `Developer ID Installer` certificates. The application certificate signs the `.app` bundle, and the installer certificate signs the `.pkg` wrapper.
:::

## Installation Location

By default the app is installed to `/Applications`. Override with `installLocation`:

```yaml
pkg:
  installLocation: "/Applications"
```

Setting a non-standard install location (e.g., `/usr/local/bin`) is unusual for Electron apps but may be needed for CLI tools bundled with the app.

## Install Scripts

Place shell scripts in the `scripts` directory (default: `build/pkg-scripts/`). These run at install time with root privileges:

| Script Name | When It Runs |
|---|---|
| `preinstall` | Before files are installed |
| `postinstall` | After files are installed |
| `preupgrade` | Before an upgrade (rarely used) |
| `postupgrade` | After an upgrade (rarely used) |

```yaml
pkg:
  scripts: build/pkg-scripts   # default
```

Example `postinstall` script:

```bash
#!/bin/bash
# Register a launch daemon after install
launchctl load /Library/LaunchDaemons/com.mycompany.myapp.daemon.plist
exit 0
```

:::warning[Script Permissions]
Scripts must be executable (`chmod +x`). Scripts run as root during installation — test thoroughly. A failing script (non-zero exit code) will abort the installation.
:::

See the [macOS Kernel Extensions tutorial](tutorials/macos-kernel-extensions.md) for a detailed example.

## Installer UI Customization

Customize the pages displayed in Apple's Installer:

```yaml
pkg:
  welcome: build/welcome.html    # or .rtf, .txt
  license: build/license.html    # or .rtf, .txt
  conclusion: build/conclusion.html
```

Supported file formats for each page: HTML, RTF, plain text.

**Background image** — displayed behind the installer pages (macOS 10.5+):

```yaml
pkg:
  background:
    file: build/installer-background.png
    alignment: center       # center | left | right | top | bottom | topleft | topright | bottomleft | bottomright
    scaling: tofit          # tofit | proportional | none
```

## Installation Behavior Options

Control how the installer behaves when re-installing or upgrading:

| Option | Default | Description |
|---|---|---|
| `isRelocatable` | `true` | Allow users to choose a different install location |
| `isVersionChecked` | `true` | Block downgrades (PKG with older version won't install over newer) |
| `hasStrictIdentifier` | `true` | Require matching bundle ID for upgrades |
| `overwriteAction` | `upgrade` | `upgrade` (recommended) or `update` |

For most apps, leave these at their defaults.

## Forcing App Closure Before Install

If your installer or upgrade requires the app to not be running:

```yaml
pkg:
  mustClose:
    - com.mycompany.myapp
    - com.mycompany.myapp.helper
```

The Installer will prompt the user to quit any running processes with matching bundle IDs before proceeding.

## Extra Component Packages

Bundle additional `.pkg` files alongside the main component:

```yaml
pkg:
  extraPkgsDir: build/extra-pkgs
```

All `.pkg` files in this directory will be included as additional components in the installer. Useful for installing additional software alongside your app (e.g., a CLI tool, a system extension).

## Complete Example

```yaml
pkg:
  identity: "Developer ID Installer: My Company (TEAM1234AB)"
  installLocation: "/Applications"
  scripts: build/pkg-scripts
  welcome: build/welcome.html
  license: build/license.rtf
  conclusion: build/conclusion.html
  background:
    file: build/background.png
    alignment: center
    scaling: tofit
  mustClose:
    - com.mycompany.myapp
  isRelocatable: true
  overwriteAction: upgrade
```

## Troubleshooting

**"The package is not signed" error:** Ensure you have a valid Developer ID Installer certificate (not Application). Check the certificate identity string matches exactly.

**Script fails silently:** Run the PKG in verbose mode via Terminal: `sudo installer -verbose -pkg YourApp.pkg -target /`. Non-zero exit from a script aborts installation.

**App not found after install:** Verify `installLocation` is correct and the app bundle ends up at the expected path. Check Console.app for installer logs.

**PKG won't overwrite existing version:** The `isVersionChecked: false` option disables version checking, allowing downgrades.

## Configuration

{!./app-builder-lib.Interface.PkgOptions.md!}
