<<<<<<< HEAD
The top-level [appImage](configuration.md#appImage) key contains set of options instructing electron-builder on how it should build [AppImage](https://appimage.org/) files.

[AppImage](https://appimage.org/) is a self-contained, portable Linux application format that packages everything an application needs to run into a single executable file — no installation, no root access required. Under the hood, the application files are stored in a [squashfs](https://en.wikipedia.org/wiki/SquashFS) filesystem that is mounted on launch.

!!! info "Desktop Integration"
    Since electron-builder 21, desktop integration is not part of the produced AppImage file. [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) is the recommended way to integrate AppImages into your desktop environment (application menu, file type associations, etc.).

---

## How AppImage Works

An AppImage is a single executable file that bundles:

- A **runtime binary** prepended at the start of the file (handles mounting and launching)
- A **squashfs filesystem** containing the application and all its dependencies

---

## Running an AppImage

Make the file executable, then run it directly — no installation or root privileges needed:

```bash
chmod +x MyApp-1.0.0-x86_64.AppImage
./MyApp-1.0.0-x86_64.AppImage
```

### Extracting an AppImage

You can extract the contents of any AppImage without running it:

```bash
./MyApp-1.0.0-x86_64.AppImage --appimage-extract
# Contents are extracted to ./squashfs-root/
```

This is useful for inspection, manual desktop integration, or debugging.

---

## Desktop Integration

AppImages do not self-integrate with your desktop by default. There are two approaches:

### Automatic Integration via AppImageLauncher (recommended)

[AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) integrates AppImages into your application menu and manages updates. Install it from your distribution's package manager or from its [releases page](https://github.com/TheAssassin/AppImageLauncher/releases).

Once installed, double-clicking an AppImage will prompt you to integrate it. AppImageLauncher handles:

- Creating a `.desktop` entry in `~/.local/share/applications/`
- Placing icons in `~/.local/share/icons/`
- Registering MIME type associations

### Manual Integration

Extract the AppImage (see above) and copy the relevant files:

```bash
# Extract
./MyApp-1.0.0-x86_64.AppImage --appimage-extract

# Copy desktop entry and icon
cp squashfs-root/myapp.desktop ~/.local/share/applications/
cp squashfs-root/myapp.png ~/.local/share/icons/hicolor/256x256/apps/

# Update the Exec= line in the .desktop file to point to the AppImage
sed -i "s|Exec=.*|Exec=/path/to/MyApp-1.0.0-x86_64.AppImage|" \
  ~/.local/share/applications/myapp.desktop

# Refresh the desktop database
update-desktop-database ~/.local/share/applications/
```

---

## Toolsets

electron-builder supports two generations of AppImage toolset, configured via the top-level `toolsets.appimage` option:

| Toolset | Runtime | Status |
|---------|---------|--------|
| `"0.0.0"` | Legacy FUSE2 | Default (deprecated) |
| `"1.0.3"` | Static runtime 20251108 | Beta (recommended) |

### Legacy Toolset (`0.0.0`) — FUSE2

The default toolset uses the original AppImage runtime, which relies on **FUSE2** (Filesystem in Userspace) to mount the squashfs filesystem at runtime.

!!! warning "FUSE2 is deprecated and being dropped by Linux distributions"
    FUSE2 has been unmaintained since 2017 and is increasingly unavailable on modern distributions. Many users on Arch Linux, Fedora, Ubuntu 24.04+, and other distros will encounter the error:

    ```
    dlopen(): error loading libfuse.so.2
    AppImages require FUSE to run.
    ```

    The modern static runtime toolset (`1.0.3`) eliminates this dependency entirely.

### Modern Toolset (`1.0.3`) — Static Runtime

The modern toolset bundles a **static AppImage runtime** that does not depend on FUSE2. The runtime is prepended directly to the squashfs filesystem and handles mounting internally. The `AppRun` entry point also performs smart sandbox detection — it only passes `--no-sandbox` to Electron when unprivileged user namespaces are unavailable, rather than always.

!!! info "Recommended for new projects"
    Use `toolsets: { appimage: "1.0.3" }` for all new projects. The static runtime eliminates the FUSE2 dependency and works on a wider range of Linux distributions. Starting in v27, this will become the default.

To opt in, add the following to your `electron-builder` configuration:

```json
{
  "toolsets": {
    "appimage": "1.0.3"
  }
}
```

Or in `package.json`:

```json
{
  "build": {
    "toolsets": {
      "appimage": "1.0.3"
    },
    "linux": {
      "target": "AppImage"
    }
  }
}
```

---

## Compression

AppImage files use [squashfs](https://en.wikipedia.org/wiki/SquashFS) internally, which supports multiple compression algorithms. The choice affects both file size and launch speed.

!!! info "Compression applies to the modern toolset only"
    The `appImage.compression` option and the compression level mapping below only apply when using toolset `1.0.3`. The legacy toolset (`0.0.0`) only supports `xz` (via the `--compression xz` flag when `compression: "maximum"` is set).

### Compression Algorithms

| Algorithm | File size | Decompression speed | Notes |
|-----------|-----------|--------------------|------------------------------------------------------------|
| `xz` | Smallest | Slowest | Best for CI artifacts / bandwidth-constrained distribution |
| `zstd` | Moderate | Fast | Default for toolset 1.0.3 — good balance |
| `lzo` | Large | Fast | Good launch-time performance |
| `lz4` | Largest | Fastest | Minimal compression, maximum decompression speed |
| `gzip` | Moderate | Moderate | Legacy default; `zstd` is strictly better |

### Controlling Compression

There are two ways to control the squashfs compression:

**Option 1 — Top-level `compression` level (maps automatically):**

```json
{
  "compression": "normal"
}
```

The top-level `compression` value maps to squashfs algorithms as follows:

| `compression` | squashfs algorithm |
|---|---|
| `"maximum"` | `xz` |
| `"normal"` (or unset) | `zstd` |
| `"store"` | `lzo` |

**Option 2 — Direct squashfs algorithm via `appImage.compression` (overrides the mapping above):**

```json
{
  "appImage": {
    "compression": "zstd"
  }
}
```

Accepts any algorithm mksquashfs supports: `"gzip"`, `"lzo"`, `"lz4"`, `"xz"`, or `"zstd"`.

---

## License Agreement (EULA)

If your application requires users to accept a license before first launch, set the `license` option to the path of a `.txt` or `.html` file:

```json
{
  "appImage": {
    "license": "build/EULA.txt"
  }
}
```

The license dialog is shown on first launch using `zenity`, `kdialog`, or `Xdialog` (whichever is available). Acceptance is recorded in `$XDG_CONFIG_HOME/<ProductFilename>/eulaAccepted`.

---
=======
The top-level [appImage](configuration.md) key contains set of options instructing electron-builder on how it should build [AppImage](https://appimage.org/) files.

## What is AppImage?

AppImage is a self-contained Linux application format — a single file that runs on almost any Linux distribution without installation. Users download the file, make it executable (`chmod +x`), and run it. No root access, no package manager, no dependencies to install.

Key characteristics:
- **No installation required** — runs directly from the downloaded file
- **Cross-distro** — works on Ubuntu, Fedora, Arch, Debian, and virtually any x86_64 or ARM Linux
- **Self-contained** — all dependencies bundled (except glibc and a few other fundamentals)
- **Portable** — can run from a USB drive or any writable location

## AppImage vs. Snap vs. Flatpak vs. DEB

| Aspect | AppImage | Snap | Flatpak | DEB/RPM |
|---|---|---|---|---|
| Installation | None | `snap install` | `flatpak install` | `apt`/`dnf` |
| Sandboxed | No | Yes (strict) | Yes | No |
| Auto-update | AppImageUpdate / electron-updater | Snap Store | Flathub | Package manager |
| Cross-distro | Yes | Yes (snapd needed) | Yes | No |
| Root required | No | No | No | Yes |
| Store distribution | N/A | Snap Store | Flathub | apt/dnf repos |
| electron-builder default | **Yes** | No | No | No |

AppImage is the default Linux target for electron-builder (`@default AppImage`).

## Desktop Integration

!!! info "Desktop Integration"
    Since electron-builder 21, desktop integration (creating `.desktop` files, associating file types, registering with application menus) is NOT handled by the AppImage itself.

The recommended way to integrate AppImages into the desktop is [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher):

- Automatically prompts users to integrate AppImages when they first run them
- Creates desktop entries, file associations, and application menu entries
- Handles AppImage updates via AppImageUpdate
- Available for Ubuntu, Debian, Fedora, and other major distros

Without AppImageLauncher, users can manually create a `.desktop` file or use the AppImage directly without system integration.

## Auto-Update Support

AppImages support delta updates via the `electron-updater` package using the zsync protocol. Configure a publish provider and electron-updater will handle updates:

```yaml
publish:
  provider: github   # or s3, generic, etc.
```

When publishing, electron-builder generates a `.AppImage.zsync` file alongside the AppImage. electron-updater uses this for efficient differential updates.

See [Auto Update](auto-update.md) for the full setup guide.

## Architecture Support

| Architecture | CLI Flag | Notes |
|---|---|---|
| `x64` | `--x64` | Standard 64-bit x86 Linux |
| `arm64` | `--arm64` | 64-bit ARM (Raspberry Pi 4+, server ARM) |
| `armv7l` | `--armv7l` | 32-bit ARM (Raspberry Pi 3 and older) |

Build requirements: Linux host (or [Docker](multi-platform-build.md#docker)) for all architectures.

## Toolset Version

electron-builder uses a bundled AppImage toolset to create AppImages. The `toolsets.appimage` option selects which version:

```yaml
toolsets:
  appimage: "0.0.0"     # stable, legacy toolset (default)
  # appimage: "1.0.3"   # beta, newer runtime
```

| Version | Runtime | Notes |
|---|---|---|
| `"0.0.0"` | Legacy | Default, stable |
| `"1.0.2"` | 20251108 | Beta |
| `"1.0.3"` | 20251108 | Beta, fixes issue #9598 |

The newer runtime versions include an updated AppImage runtime binary that supports more modern Linux features.

## Desktop Entry Customization

Customize the `.desktop` file metadata embedded in the AppImage via the `linux.desktop` option:

```yaml
linux:
  desktop:
    entry:
      Name: My Application
      Comment: A great application
      Categories: Office;Productivity
      Keywords: productivity;tool
      StartupWMClass: myapp
    desktopActions:
      NewWindow:
        Name: New Window
        Exec: myapp --new-window
```

See [Linux Configuration](linux.md#desktop-file-customization) for the full desktop entry reference.

## MIME Type Associations

Associate your AppImage with file types via `linux.mimeTypes`:

```yaml
linux:
  mimeTypes:
    - application/x-myapp-document
```

## Build Requirements

AppImages must be built on Linux (or via Docker). They cannot be cross-compiled from macOS or Windows.

To build on a non-Linux host:

```bash
# Build Linux targets using Docker
docker run --rm -ti \
  --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "npm install && npx electron-builder --linux"
```

See [Multi Platform Build](multi-platform-build.md#docker) for full Docker documentation.

## Debugging

Enable verbose output:

```bash
DEBUG=electron-builder electron-builder --linux AppImage
```

Test the built AppImage:

```bash
chmod +x dist/MyApp-1.0.0.AppImage
./dist/MyApp-1.0.0.AppImage --no-sandbox
```

The `--no-sandbox` flag may be required on some distributions where user namespaces are restricted.
>>>>>>> 02ca7cf360c16f460008f9c5dc15f38e1ae88e2b

## Configuration

{!./app-builder-lib.Interface.AppImageOptions.md!}
