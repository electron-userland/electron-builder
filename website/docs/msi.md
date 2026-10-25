The top-level [msi](configuration.md) key contains a set of options instructing electron-builder on how it should build Windows MSI (Microsoft Installer) packages.

## When to Use MSI

MSI packages use Windows Installer technology and are the standard format for enterprise software deployment:

- **Group Policy deployment** — IT administrators can silently push MSI packages to managed machines via Active Directory
- **SCCM / Intune / MDM** — Microsoft's enterprise management tools work natively with MSI
- **Silent installation** — standard `/quiet` and `/passive` flags work without custom configuration
- **Windows Store compatibility** — MSI can be used as a basis for MSIX packaging (see [MSI-Wrapped](msi-wrapped.md))
- **Upgrade/downgrade control** — Windows Installer handles version management via upgrade codes

## MSI vs. NSIS vs. Portable

| Aspect | MSI | NSIS | Portable |
|---|---|---|---|
| Enterprise deployment | Excellent | Limited | None |
| Silent install | `/quiet` flag | Custom scripting | N/A |
| Group Policy | Yes | No | No |
| Customizability | Moderate (WiX) | Excellent | N/A |
| UI flexibility | Limited | Highly customizable | N/A |
| File size | Typically larger | Compressed | No overhead |
| Auto-update | Not supported via electron-updater | electron-updater | Manual |
| Recommended for | Enterprise | Consumer | USB/no-install |

## Upgrade Code

The `upgradeCode` is a GUID that uniquely identifies your product across all versions. It persists through upgrades and is used by Windows Installer to find and upgrade existing installations.

:::warning[Critical: Do Not Change After First Release]
If you change the `upgradeCode` after your first release, Windows Installer will treat the new version as a completely different product — existing installations will NOT be upgraded, and users will end up with both versions installed. Set this once and never change it.
:::

```yaml
msi:
  upgradeCode: "{A1234567-BCDE-F012-3456-789ABCDEF012}"
```

If not specified, a deterministic GUID is generated from the app ID (`appId`). Explicitly setting it is strongly recommended for production.

## One-Click Installation

```yaml
msi:
  oneClick: true    # Default: true
```

When `oneClick` is `true`, the installer runs without showing UI (silent install). Set to `false` for a traditional wizard-style installer.

## Per-Machine vs. Per-User Installation

```yaml
msi:
  perMachine: false   # Default: false (per-user install)
```

- `perMachine: false` — installs for the current user only, no admin required
- `perMachine: true` — installs for all users, requires administrator privileges

For enterprise deployment via Group Policy, `perMachine: true` is typically required.

:::warning[Deploying with Intune, Configuration Manager or another MDM]
With the default `perMachine: false`, the MSI sets `ALLUSERS=2` and `MSIINSTALLPERUSER=1`, which Windows Installer treats as a per-user installation. Management tools that install in the device (SYSTEM) context therefore install the app into the SYSTEM account's own profile, where no signed-in user can find it. Set `perMachine: true` for those deployments, so the app installs into Program Files for every user.

`runAfterFinish` only launches the app when the installer shows UI. A silent install (`msiexec /qn`) does not start it.
:::

## Desktop and Start Menu Shortcuts

Shortcut creation is controlled via the inherited `CommonWindowsInstallerConfiguration` options:

```yaml
msi:
  createDesktopShortcut: true         # Default: true
  createStartMenuShortcut: true       # Default: true
  menuCategory: "My Company"          # Creates a subfolder in Start Menu
  shortcutName: "My App"             # Overrides default shortcut name
  runAfterFinish: true                # Launch app after installation completes
```

## WiX Customization

The MSI target uses [WiX Toolset](https://wixtoolset.org/) internally. You can pass additional arguments to the WiX compiler (`candle.exe`) and linker (`light.exe`):

```yaml
msi:
  additionalWixArgs:
    - "-dMyVariable=MyValue"
    - "-ext WixUIExtension"
  additionalLightArgs:
    - "-sice:ICE80"
```

Use `msiProjectCreated` hook to modify the generated WiX project files before they are compiled:

```yaml
msiProjectCreated: ./msi-hook.js
```

### WiX version and arm64

The MSI target builds with WiX 3.14.1 ([`toolsets.wix`](./toolsets.md) `"latest"`), which produces a native `arm64` MSI for an `arm64` build. The legacy WiX bundle used before v27 (a WiX 4.0.0.5512 preview) has no `arm64`, so with it an `arm64` build is packaged in an **x64** MSI that installs the arm64 app. To keep it:

```yaml
toolsets:
  wix: "0.0.0"
```

For an x64 or ia32 build, both bundles install the same files in the same place, with the same upgrade code. For an `arm64` build the package itself differs: WiX 3 builds an `Arm64` MSI, the legacy bundle an x64 one.

The `.wxs` dialect differs too: WiX 3 uses the namespace `http://schemas.microsoft.com/wix/2006/wi`, so an `msiProjectCreated` hook that inserts elements of a WiX 4 extension namespace must use the WiX 3 one, for example `http://schemas.microsoft.com/wix/UtilExtension` instead of `http://wixtoolset.org/schemas/v4/wxs/util` (or pin `"0.0.0"`). With WiX 3, a project that declares a WiX 4 namespace after the hook runs fails the build with an error that names it.

## Warnings as Errors

```yaml
msi:
  warningsAsErrors: true    # Default: true
```

WiX compiler warnings are treated as errors by default. Set to `false` if you're using advanced WiX features that trigger known benign warnings.

## Silent Installation

MSI packages support standard Windows Installer command-line flags for silent deployment:

```cmd
# Silent install (no UI)
MyApp-Setup.msi /quiet

# Passive install (progress bar only)
MyApp-Setup.msi /passive

# Silent uninstall
msiexec /x {PRODUCT-CODE} /quiet

# Install per-machine
MyApp-Setup.msi /quiet ALLUSERS=1

# Install to custom path
MyApp-Setup.msi /quiet INSTALLDIR="C:\MyCustomPath\MyApp"
```

## Complete Example

```yaml
win:
  target:
    - msi

msi:
  oneClick: true
  perMachine: true
  upgradeCode: "{A1234567-BCDE-F012-3456-789ABCDEF012}"
  createDesktopShortcut: true
  createStartMenuShortcut: true
  menuCategory: "My Company"
  runAfterFinish: false       # Don't auto-launch after silent enterprise install
  warningsAsErrors: true
```

## Troubleshooting

**Build fails with WiX error:** Enable verbose output with `DEBUG=electron-builder` and check the WiX error codes. Common issues include missing files or invalid GUIDs.

**Upgrade installs alongside old version:** Verify the `upgradeCode` is set and has not changed between versions. Also ensure `ProductCode` (auto-generated per version) is different.

**Silent install shows UI:** Confirm `oneClick: true` is set and the `/quiet` flag is being used. Some antivirus software intercepts installer launches.

**Per-machine install fails without admin:** Per-machine installation requires elevation. Ensure the deployment mechanism (SCCM, Intune, GPO) runs the installer in a privileged context.

## Configuration

{!./app-builder-lib.Interface.MsiOptions.md!}
