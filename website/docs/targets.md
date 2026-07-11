# Target Selection Guide

This page helps you choose the right packaging format for each platform. The right choice depends on your distribution method, target audience, and operational requirements.

## Windows Targets

| Target | Format | Best For | Admin Required | Auto-Update |
|---|---|---|---|---|
| `nsis` | `.exe` installer | Consumer apps (most common) | Optional (per-user mode) | electron-updater |
| `nsis-web` | `.exe` web installer | Apps with large assets | Optional | electron-updater |
| `portable` | `.exe` no-install | USB drives, no-install scenarios | No | Manual |
| `appx` | `.appx` | Windows Store, enterprise MDM | Managed by Store | Store only |
| `msix` | `.msix` / `.msixbundle` / `.msixupload` | Windows Store, modern deployment (successor to AppX) | Managed by Store | Store only |
| `msi` | `.msi` | Enterprise deployment (SCCM/Intune/GPO) | Yes | Not supported via electron-updater |
| `msi-wrapped` | `.msi` wrapping NSIS | Enterprise + existing NSIS installer | Yes | electron-updater |
| `squirrel.windows` | `.exe` / NuGet | Legacy (not recommended) | No | Squirrel |

### When to Use Each Windows Target

**NSIS** (`nsis`) — the default and best choice for most applications.
- Consumer software distributed via your website or GitHub releases
- Both per-user (no admin) and per-machine install modes available
- Script-based customization via NSIS macros (`.nsh` hooks) — not visual UI theming
- Works with electron-updater for auto-updates

**NSIS Web** (`nsis-web`) — use when your app download is very large.
- Produces a small stub installer that downloads the full payload at install time
- Suitable for apps with many platform-specific binaries
- Requires internet connectivity at install time

**Portable** (`portable`) — use when no installation at all is the goal.
- Single executable, runs from any location
- No registry entries, no Start menu entries
- Common for developer tools, USB-stick deployments
- Auto-updates require manual implementation

**AppX** (`appx`) — use for Windows Store distribution or enterprise MDM.
- Required for listing in the Microsoft Store
- Enterprise IT can deploy via Intune/MDM without the Store
- Code signing with a trusted certificate is required for sideloading
- See [AppX Configuration](appx.md)

**MSIX** (`msix`) — the modern successor to AppX (beta); prefer it for new Store/MDM work.
- Produces `.msix`, multi-architecture `.msixbundle`, and Store `.msixupload` artifacts
- Adds modern manifest features: package integrity and Windows services
- Requires the modern `winCodeSign` toolset (the default; only the legacy `0.0.0` bundle is rejected); builds on Windows 10 / Windows Server 2012 R2 (6.3+) or later, or macOS via Parallels
- See [MSIX Configuration](msix.md)

**MSI** (`msi`) — use for enterprise deployment via Group Policy or SCCM.
- IT departments can deploy silently across managed machines
- Supports standard MSI command-line flags (`/quiet`, `/passive`)
- Upgrade code is critical — changing it breaks silent upgrades of existing installs
- See [MSI Configuration](msi.md)

**MSI-Wrapped** (`msi-wrapped`) — use when you need MSI packaging but want NSIS features.
- Wraps your existing NSIS installer inside an MSI container
- Enables Group Policy deployment of apps with NSIS-based setup logic
- See [MSI-Wrapped Configuration](msi-wrapped.md)

### Windows Decision Tree

```
Do you need Windows Store distribution?
  → Yes, modern (recommended): MSIX
  → Yes, legacy: AppX

Do you need enterprise GPO/SCCM/Intune deployment?
  → Yes, native MSI: MSI
  → Yes, but keep NSIS features: MSI-Wrapped

Is this a consumer app?
  → Normal installer: NSIS (default)
  → Very large download: NSIS-Web
  → No installation at all: Portable
```

---

## macOS Targets

| Target | Format | Best For | Code Signing | Notarization |
|---|---|---|---|---|
| `dmg` | `.dmg` disk image | Standard consumer distribution | Developer ID Application | Required (10.15+) |
| `pkg` | `.pkg` installer | System-level installs, launch agents | Developer ID Installer | Required (10.15+) |
| `zip` | `.zip` archive | Update server payload, minimal size | Developer ID Application | Required (10.15+) |
| `mas` | App bundle (Store) | Mac App Store | Apple Distribution | No (Apple signs) |
| `mas-dev` | App bundle (dev) | Testing MAS builds locally | Apple Development | No |
| `dir` | Directory | Development / debugging | Optional | No |

### When to Use Each macOS Target

**DMG** (`dmg`) — the standard for consumer macOS distribution.
- Drag-and-drop install with `/Applications` shortcut
- Customizable window, background, icon layout
- electron-updater supports updates via ZIP payload
- See [DMG Configuration](dmg.md)

**PKG** (`pkg`) — use when you need system-level installation.
- Required for kernel extensions, launch daemons, or files outside `/Applications`
- Pre/post-install scripts via the `scripts` directory
- Requires a separate "Developer ID Installer" certificate
- See [PKG Configuration](pkg.md)

**ZIP** — use as the update payload for electron-updater.
- Smaller than DMG for the same content
- Not user-facing — used internally by the auto-update mechanism
- Commonly built alongside DMG

**MAS** (`mas`) — required for Mac App Store submission.
- Uses App Sandbox — your app must declare all permissions via entitlements
- Requires provisioning profiles
- Apple handles signing during the Store submission process
- See [MAS Configuration](mas.md)

### macOS Decision Tree

```
Is the app going to the Mac App Store?
  → Yes: MAS
  → Testing MAS builds: mas-dev

Does the app install system components (daemons, kernel extensions)?
  → Yes: PKG

Standard consumer distribution?
  → Yes: DMG (+ ZIP for auto-updates)
```

---

## Linux Targets

| Target | Format | Best For | Sandboxed | Distro Support |
|---|---|---|---|---|
| `AppImage` | `.AppImage` | Universal, no install | No | Universal |
| `deb` | `.deb` | Debian, Ubuntu, Mint | No | Debian-based |
| `rpm` | `.rpm` | Fedora, RHEL, openSUSE | No | RPM-based |
| `snap` | Snap package | Ubuntu-primary, Store distribution | Yes | Any (snapd) |
| `flatpak` | Flatpak bundle | Cross-distro sandboxed | Yes | Any (flatpak) |
| `pacman` | `.pkg.tar.zst` | Arch Linux, Manjaro | No | Arch-based |
| `apk` | `.apk` | Alpine Linux, Docker | No | Alpine |
| `freebsd` | `.pkg` | FreeBSD | No | FreeBSD |
| `p5p` | IPS package | Solaris / illumos | No | Solaris-based |
| `zip`, `tar.gz` | Archive | CDN / custom deployment | No | Universal |

### When to Use Each Linux Target

**AppImage** — built by default alongside Snap; best first choice for broad compatibility.
- Single file, no installation, no root required
- Runs on virtually any x86_64 Linux distribution
- [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) handles desktop integration
- electron-updater supports delta updates via embedded blockmap (no separate file needed)
- See [AppImage Configuration](appimage.md)

**DEB** — use for Debian-based distribution (Ubuntu, Mint, etc.).
- Installable via `apt` from a repository or directly
- Best when targeting Ubuntu users who expect `.deb` packages
- See [Linux Configuration → DEB](linux.md#debian-package-deb)

**RPM** — use for Red Hat-based distribution (Fedora, RHEL, CentOS, openSUSE).
- Installable via `dnf`/`yum`
- See [Linux Configuration → RPM](linux.md#rpm-package-rpm)

**Snap** — use for Ubuntu-primary distribution via the Snap Store.
- Automatic updates via Snap Store
- Sandboxed with `strict` confinement
- Required for Snap Store listing
- See [Snap Configuration](snap.md)

**Flatpak** — use for cross-distro sandboxed distribution.
- Works on any distro with `flatpak` installed
- electron-builder produces single-file bundles (not Flathub repository packages)
- See [Flatpak Configuration](flatpak.md)

**Pacman** — use for Arch Linux and Arch-based distributions.
- Beta status — test thoroughly
- See [Linux Configuration → Pacman](linux.md#pacman-package-pacman)

**APK** — use for Alpine Linux or Docker container base images.
- Alpine uses musl libc; some native modules need recompilation
- See [Linux Configuration → Alpine APK](linux.md#alpine-apk-package-apk)

### Linux Decision Tree

```
Universal distribution, no install required?
  → AppImage (default)

Ubuntu Store / auto-update via Snap?
  → Snap

Cross-distro sandbox?
  → Flatpak

Debian/Ubuntu apt repository?
  → DEB

Fedora/RHEL/openSUSE dnf repository?
  → RPM

Arch Linux?
  → Pacman (beta)

Alpine / Docker?
  → APK
```

---

## Combining Multiple Targets

You can build multiple targets in a single run:

```yaml
# electron-builder.yml
win:
  target:
    - nsis
    - portable

mac:
  target:
    - dmg
    - zip

linux:
  target:
    - AppImage
    - deb
```

```bash
# CLI: build all configured targets
electron-builder --mac --win --linux

# Build specific targets
electron-builder --win nsis --win msi

# Build for specific architectures
electron-builder --mac --x64 --arm64
```

## Related Pages

- [Architecture & Multi-Arch](architecture.md) — building for multiple CPU architectures
- [GitHub Actions](features/github-actions.md) — CI/CD workflows for multi-platform builds
- [Code Signing](features/code-signing/code-signing.md) — signing requirements by platform
