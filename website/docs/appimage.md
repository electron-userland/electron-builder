The top-level [appImage](configuration.md#appimage) key contains a set of options instructing electron-builder on how it should build [AppImage](https://appimage.org/) files.

[AppImage](https://appimage.org/) is a self-contained, portable Linux application format that packages everything an application needs to run into a single executable file — no installation, no root access required. Under the hood, the application files are stored in a [squashfs](https://en.wikipedia.org/wiki/SquashFS) filesystem that is mounted on launch.

AppImage is one of the two default Linux targets for electron-builder (along with Snap).

## AppImage vs. Snap vs. Flatpak vs. DEB

| Aspect | AppImage | Snap | Flatpak | DEB/RPM |
|---|---|---|---|---|
| Installation | None | `snap install` | `flatpak install` | `apt`/`dnf` |
| Sandboxed | No | Yes (strict) | Yes | No |
| Auto-update | AppImageUpdate / electron-updater | Snap Store | Flathub | Package manager |
| Cross-distro | Yes | Yes (snapd needed) | Yes | No |
| Root required | No | No | No | Yes |
| electron-builder default | **Yes** | **Yes** | No | No |

## How AppImage Works

An AppImage is a single executable file that bundles:

- A **runtime binary** prepended at the start of the file (handles mounting and launching)
- A **squashfs filesystem** containing the application and all its dependencies

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

## Desktop Integration

:::info[Desktop Integration]
Since electron-builder 21, desktop integration (creating `.desktop` files, associating file types, registering with application menus) is NOT handled by the AppImage itself.
:::

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

## Auto-Update Support

AppImages support differential (delta) updates via the `electron-updater` package. electron-builder embeds a blockmap directly into the AppImage binary at build time — no separate file needs to be published alongside it. electron-updater reads the embedded blockmap to determine which blocks have changed and downloads only those blocks. Configure a publish provider and electron-updater will handle updates:

```yaml
publish:
  provider: github   # or s3, generic, etc.
```

See [Auto Update](features/auto-update.md) for the full setup guide.

## Architecture Support

| Architecture | CLI Flag | Notes |
|---|---|---|
| `x64` | `--x64` | Standard 64-bit x86 Linux |
| `arm64` | `--arm64` | 64-bit ARM (Raspberry Pi 4+, server ARM) |
| `armv7l` | `--armv7l` | 32-bit ARM (Raspberry Pi 3 and older) |

Build requirements: Linux host (or [Docker](features/multi-platform-build.md#docker)) for all architectures.

## Toolsets

electron-builder supports two generations of AppImage toolset, configured via the top-level `toolsets.appimage` option:

| Toolset | Runtime | Status |
|---|---|---|
| `"0.0.0"` | Legacy FUSE2 | Default (deprecated) |
| `"1.0.2"` | Static runtime 20251108 | Beta |
| `"1.0.3"` | Static runtime 20251108 | Beta (recommended) |

### Legacy Toolset (`0.0.0`) — FUSE2

The default toolset uses the original AppImage runtime, which relies on **FUSE2** (Filesystem in Userspace) to mount the squashfs filesystem at runtime.

:::warning[FUSE2 is deprecated and being dropped by Linux distributions]
FUSE2 has been unmaintained since 2017 and is increasingly unavailable on modern distributions. Many users on Arch Linux, Fedora, Ubuntu 24.04+, and other distros will encounter the error:

```
dlopen(): error loading libfuse.so.2
AppImages require FUSE to run.
```

The modern static runtime toolset (`1.0.3`) eliminates this dependency entirely.
:::

### Modern Toolset (`1.0.3`) — Static Runtime

The modern toolset bundles a **static AppImage runtime** that does not depend on FUSE2. The runtime is prepended directly to the squashfs filesystem and handles mounting internally. The `AppRun` entry point also performs smart sandbox detection — it only passes `--no-sandbox` to Electron when unprivileged user namespaces are unavailable, rather than always.

:::info[Recommended for new projects]
Use `toolsets: { appimage: "1.0.3" }` for all new projects. The static runtime eliminates the FUSE2 dependency and works on a wider range of Linux distributions. Starting in v27, this will become the default.
:::

To opt in, add to your electron-builder configuration:

```yaml
toolsets:
  appimage: "1.0.3"
```

## Compression

AppImage files use [squashfs](https://en.wikipedia.org/wiki/SquashFS) internally. The compression algorithm affects file size and launch speed.

:::info[Compression support by toolset]
- **Legacy FUSE2 (`0.0.0`)**: only `xz` can be passed explicitly (when the root `compression` is `"maximum"`). All other values use mksquashfs's default (gzip).
- **Static runtime (`1.0.2`, `1.0.3`)**: supports `gzip` and `zstd`. The `appImage.compression` option selects the algorithm directly; `"xz"` is mapped to `"zstd"` (xz is not compiled into the static runtime binary).
:::

| Algorithm | File size | Decompression speed | Notes |
|---|---|---|---|
| `zstd` | Moderate | Fast | Default for static runtime |
| `gzip` | Moderate | Moderate | Legacy mksquashfs default |
| `xz` | Smallest | Slowest | Mapped to `zstd` on static runtime |

Direct algorithm selection (static runtime only):

```yaml
appImage:
  compression: zstd   # gzip | zstd | xz (mapped to zstd)
```

## License Agreement (EULA)

If your application requires users to accept a license before first launch, set the `license` option to the path of a `.txt` or `.html` file:

```yaml
appImage:
  license: build/EULA.txt
```

The license dialog is shown on first launch using `zenity`, `kdialog`, or `Xdialog` (whichever is available). Acceptance is recorded in `$XDG_CONFIG_HOME/<ProductFilename>/eulaAccepted`.

## Build Requirements

AppImages must be built on Linux (or via Docker). They cannot be cross-compiled from macOS or Windows.

To build on a non-Linux host:

```bash
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

See [Multi Platform Build](features/multi-platform-build.md#docker) for full Docker documentation.

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

## Configuration

{!./app-builder-lib.Interface.AppImageOptions.md!}
