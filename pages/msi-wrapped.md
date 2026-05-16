The top-level [msiWrapped](configuration.md#msiWrapped) key contains set of options instructing electron-builder on how it should build Windows MSI-Wrapped packages.

!!! note "Experimental"
    The MSI-Wrapped target is experimental. It wraps an existing NSIS installer inside an MSI container.

## What is MSI-Wrapped?

MSI-Wrapped is a hybrid approach that combines the customizability of NSIS with the enterprise deployment compatibility of MSI. It works by:

1. Building your normal NSIS installer
2. Wrapping the NSIS `.exe` inside a minimal MSI package
3. The MSI acts as a thin shell that executes the NSIS installer when deployed

This allows enterprise IT teams to deploy the package through MSI-compatible tools (Group Policy, SCCM, Intune) while you retain all of NSIS's powerful customization capabilities for the actual installation experience.

## MSI-Wrapped vs. Native MSI

| Aspect | MSI-Wrapped | Native MSI |
|---|---|---|
| Underlying installer | NSIS | WiX-generated MSI |
| NSIS customization | Full | None |
| Enterprise MSI deployment | Yes | Yes |
| Silent install | Via NSIS flags | Via MSI `/quiet` |
| Windows Store (MSIX) | Limited | Better |
| Complexity | Lower | Higher |

## When to Use MSI-Wrapped

Choose MSI-Wrapped when:
- You already have a well-configured NSIS installer and need to deploy it via Group Policy or MDM
- Your enterprise customers require MSI format but you don't want to maintain a separate MSI configuration
- You need NSIS-level UI customization combined with MSI deployment

Choose [native MSI](msi.md) when:
- You need full MSI capabilities (custom actions, rollback, MSI database manipulation)
- You're targeting Windows Store / MSIX conversion
- You need clean per-machine/per-user support without NSIS

## Configuration

### Wrapped Installer Arguments

Pass additional command-line arguments to the wrapped NSIS installer when it is executed:

```yaml
msiWrapped:
  wrappedInstallerArgs: "/S /D=C:\\MyApp"
```

### Impersonation

```yaml
msiWrapped:
  impersonate: false    # Default: false
```

When `impersonate: true`, the MSI wrapper executes the NSIS installer under the user's identity rather than the system/SYSTEM account. This is useful for per-user installations that need to access user-specific resources.

### Upgrade Code

```yaml
msiWrapped:
  upgradeCode: "{A1234567-BCDE-F012-3456-789ABCDEF012}"
```

!!! warning "Critical: Do Not Change After First Release"
    See the [MSI upgrade code warning](msi.md#upgrade-code) — the same applies here.

## Complete Example

```yaml
win:
  target:
    - nsis
    - msi-wrapped

nsis:
  oneClick: false
  perMachine: true
  allowToChangeInstallationDirectory: true

msiWrapped:
  upgradeCode: "{A1234567-BCDE-F012-3456-789ABCDEF012}"
  impersonate: false
  wrappedInstallerArgs: "/SILENT"
```

## Configuration

{!./app-builder-lib.Interface.MsiWrappedOptions.md!}
