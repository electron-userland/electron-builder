# Architecture & Multi-Arch Builds

electron-builder can produce builds for multiple CPU architectures. This page covers architecture support by platform, how to build universal macOS binaries, and cross-compilation considerations.

## Supported Architectures by Platform

| Platform | Architecture | CLI Flag | Notes |
|---|---|---|---|
| macOS | x64 | `--x64` | Intel Macs |
| macOS | arm64 | `--arm64` | Apple Silicon (M1/M2/M3/M4) |
| macOS | universal | `--universal` | Runs natively on both Intel and Apple Silicon |
| Windows | x64 | `--x64` | Most common desktop target |
| Windows | ia32 | `--ia32` | 32-bit; legacy support. Requires `electronVersion` <= 43.x — [Electron 44 removed Windows ia32 builds](https://github.com/electron/electron/pull/51816) |
| Windows | arm64 | `--arm64` | Windows on ARM (Surface Pro X, etc.) |
| Linux | x64 | `--x64` | Standard 64-bit x86 Linux |
| Linux | arm64 | `--arm64` | Raspberry Pi 4+, ARM servers, cloud instances |
| Linux | armv7l | `--armv7l` | Raspberry Pi 3 and older, 32-bit ARM. Requires `electronVersion` <= 43.x — [Electron 44 removed Linux armv7l builds](https://github.com/electron/electron/pull/51816) |

:::note[32-bit support ends with Electron 43]
Electron 44 removed Windows ia32 and Linux armv7l builds ([electron/electron#51816](https://github.com/electron/electron/pull/51816)). To keep shipping those architectures, stay on Electron <= 43.x — the v43 series is supported until its end-of-life in January 2027. electron-builder fails fast with a configuration error when such a build is requested against Electron 44+ (downgraded to a warning when a custom `electronDist` or Electron mirror is configured).
:::

## Specifying Architecture

### CLI

```bash
# Build for a specific architecture
electron-builder --mac --x64
electron-builder --mac --arm64
electron-builder --mac --universal

# Build multiple architectures in sequence
electron-builder --win --x64 --arm64

# Build for all configured targets and architectures
electron-builder --mac --win --linux
```

### Configuration

```yaml
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
        - universal
    - target: zip
      arch: universal
```

## macOS: Universal Binaries

A **universal binary** contains both x64 and arm64 slices in a single executable. It runs natively on Intel Macs and Apple Silicon without Rosetta 2 translation.

### Building Universal

```bash
electron-builder --mac --universal
```

Or set in configuration:

```yaml
mac:
  target:
    - target: dmg
      arch: universal
```

electron-builder downloads both x64 and arm64 Electron binaries, then merges them using `lipo`.

### How ASAR Merging Works

When building a universal binary, electron-builder must merge two ASAR archives (one per architecture). This works automatically for pure JavaScript. For native modules:

```yaml
mac:
  mergeASARs: true        # Default: true — merge the two per-arch ASARs into one
  singleArchFiles: ""     # Glob of files that must NOT be merged (arch-specific binaries)
  x64ArchFiles: ""        # Glob of files that exist only in the x64 build
```

### Arch-Specific Native Modules

If you have native modules that differ between x64 and arm64, you must configure which files should remain architecture-specific:

```yaml
mac:
  mergeASARs: true
  singleArchFiles: "node_modules/canvas/**"   # only exists in x64
```

For modules that exist in both architectures but have different binaries:

```yaml
mac:
  mergeASARs: true
  x64ArchFiles: "node_modules/my-module/build/Release/my_module.node"
```

### Verifying a Universal Binary

```bash
# Check that both slices are present
lipo -info dist/mac-universal/MyApp.app/Contents/MacOS/MyApp
# Should output: Architectures in the fat file: x64 arm64

# Check a framework
lipo -info "dist/mac-universal/MyApp.app/Contents/Frameworks/Electron Framework.framework/Electron Framework"
```

### Universal vs. Separate Builds

| Approach | Pros | Cons |
|---|---|---|
| Universal (`universal`) | Single download for all users | ~2x file size |
| Separate (`x64` + `arm64`) | Smaller download per user | Two separate release artifacts |

Most consumer apps ship universal binaries for the best user experience. If binary size is critical, ship separate architectures.

## Windows ARM64

Windows ARM64 builds run natively on ARM-based Windows devices (Surface Pro X, Snapdragon-based laptops, etc.).

```bash
electron-builder --win --arm64
```

:::note[Cross-compilation from x64]
Windows ARM64 builds can be cross-compiled from an x64 Windows machine. The Electron binary for ARM64 is downloaded automatically.
:::

## Linux ARM

Linux ARM builds are commonly used for:
- **Raspberry Pi** — `armv7l` (Pi 3 and older) or `arm64` (Pi 4+)
- **ARM servers** — `arm64` (AWS Graviton, Ampere Altra, etc.)
- **Embedded Linux** — `armv7l`

```bash
# For Raspberry Pi 4+ and ARM servers
electron-builder --linux --arm64

# For older Raspberry Pi (32-bit OS)
electron-builder --linux --armv7l
```

### Building Linux ARM on x64

Linux ARM can be built on an x64 machine using QEMU emulation via Docker:

```bash
# Install QEMU support (one-time setup)
docker run --privileged --rm tonistiigi/binfmt --install arm64,arm

# Build ARM64 AppImage
docker run --rm \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  --platform linux/arm64 \
  electronuserland/builder \
  /bin/bash -c "npm ci && npx electron-builder --linux --arm64"
```

## Cross-Platform Builds

### Building Windows on Linux/macOS

Use the Wine-based Docker image:

```bash
docker run --rm \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "npm ci && npx electron-builder --win"
```

Wine is used to run NSIS (which generates the `.exe` installer). The Electron binary itself is compiled natively — Wine is only needed for the installer tool.

### Building Linux on macOS

Linux builds require either a native Linux machine or Docker:

```bash
docker run --rm \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder \
  /bin/bash -c "npm ci && npx electron-builder --linux"
```

### Building AppX on macOS (via Parallels VM)

For AppX (Windows Store), `MakeAppx.exe` requires Windows. When building on macOS with Parallels Desktop (Pro Edition), electron-builder automatically detects and uses the running Windows VM.

See [Multi Platform Build](features/multi-platform-build.md) for full Docker documentation.

## Native Modules and Architecture

Native modules (`.node` files) are compiled for a specific architecture and cannot be used in a different architecture without recompilation.

In practice, electron-builder handles this automatically during the build process when `npmRebuild: true` (the default).

### Universal Binary with Native Modules

Building a universal macOS binary with native modules requires that each native module has both x64 and arm64 variants. If a module only has one architecture, you'll need to use `singleArchFiles` to keep it arch-specific:

```yaml
mac:
  mergeASARs: true
  singleArchFiles: "node_modules/serialport/**/*.node"
```

Or if you can compile the module for both architectures, the universal build will merge them automatically via `lipo`.

## Architecture in GitHub Actions

Build multiple architectures in parallel using a matrix:

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            args: --mac --universal
          - os: windows-latest
            args: --win --x64 --arm64
          - os: ubuntu-latest
            args: --linux --x64

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx electron-builder ${{ matrix.args }} --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Related Pages

- [GitHub Actions](features/github-actions.md) — full CI/CD workflows
- [Multi Platform Build](features/multi-platform-build.md) — Docker images and cross-compilation
- [macOS Configuration](mac.md) — `mergeASARs`, `singleArchFiles`, `x64ArchFiles`
- [Target Selection](targets.md) — choosing the right target format per platform
