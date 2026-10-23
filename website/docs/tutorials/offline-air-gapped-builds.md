---
title: "Offline / Air-Gapped Builds"
---

electron-builder downloads two kinds of artifacts at build time:

1. The **Electron distribution** (`electron-v<version>-<platform>-<arch>.zip`), fetched via [@electron/get](https://github.com/electron/get).
2. **electron-builder toolsets** (AppImage tools, fpm, NSIS, winCodeSign, 7-Zip, …), fetched from [electron-builder-binaries](https://github.com/electron-userland/electron-builder-binaries) releases.

Both can be pre-seeded so that a build runs with **no network access at all** — the pattern used by Flathub builds, locked-down CI, and other air-gapped environments. This page describes the exact on-disk contracts. The `flatpak` target has one more requirement, which is not a cache: see [Flatpak target](#flatpak-target).

:::tip[Warm the cache online, then copy]
The simplest approach: run one full build on an online machine with the same OS, architecture, Electron version and targets, then copy both cache directories (see below) to the offline machine. Everything on this page also works with manually seeded files.
:::

## Electron distribution

### Cache layout

@electron/get caches the Electron zip under its own cache root:

| Platform | Default cache root                                        |
| -------- | --------------------------------------------------------- |
| Linux    | `$XDG_CACHE_HOME/electron` or `~/.cache/electron`          |
| macOS    | `~/Library/Caches/electron`                                |
| Windows  | `%LOCALAPPDATA%/electron/Cache`                            |

Inside the cache root, each artifact lives in a directory named after the SHA-256 hash of the download URL's **directory** (the URL without the trailing file name):

```
<cacheRoot>/<sha256 of url-dirname>/electron-v<version>-<platform>-<arch>.zip
```

For the default mirror, the hashed string is `https://github.com/electron/electron/releases/download/v<version>`. You can compute the directory name with:

```bash
node -e 'console.log(require("crypto").createHash("sha256").update("https://github.com/electron/electron/releases/download/v35.0.0").digest("hex"))'
```

Tools like [flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools) produce this layout automatically.

### Offline checksum validation: seed `SHASUMS256.txt-<version>`

Historically, a fully seeded cache was **not** enough: @electron/get validates every artifact — even cache hits — against `SHASUMS256.txt`, and it always re-downloads that file (its internal fetch hardcodes `cacheMode: Bypass`). In an air-gapped environment the build died with a DNS/network error (e.g. `getaddrinfo EAI_AGAIN github.com`) despite a perfect cache.

electron-builder now looks for a locally seeded SHASUMS file **flat at the cache root** and, when found, passes its contents to @electron/get as inline checksums — so validation stays enabled but runs fully offline:

```
<cacheRoot>/SHASUMS256.txt-<version>   # preferred; the layout flatpak-node-generator already produces
<cacheRoot>/SHASUMS256.txt             # fallback for manual seeding
```

The file is the standard upstream format (one `<sha256> *<filename>` line per artifact) published with every Electron release, e.g. [`https://github.com/electron/electron/releases/download/v35.0.0/SHASUMS256.txt`](https://github.com/electron/electron/releases). A seeded file is only used when it actually contains an entry for the artifact being downloaded, so a stale file for another version is ignored rather than breaking the build.

```bash
# seed example for Electron 35.0.0 on linux-x64
CACHE=~/.cache/electron
URL_DIR="https://github.com/electron/electron/releases/download/v35.0.0"
HASH=$(node -e "console.log(require('crypto').createHash('sha256').update('$URL_DIR').digest('hex'))")
mkdir -p "$CACHE/$HASH"
cp electron-v35.0.0-linux-x64.zip "$CACHE/$HASH/"
cp SHASUMS256.txt "$CACHE/SHASUMS256.txt-35.0.0"
```

### Alternatives

- **`electronGet.checksums`** — provide the checksums explicitly in your configuration instead of seeding a file (keys are artifact file names, values are SHA-256 hex):

  ```yaml
  electronGet:
    checksums:
      electron-v35.0.0-linux-x64.zip: 877617029f4c0f2b24f3805a1c3554ba166fda65c4e88df9480ae7b6ffa26a22
  ```

  Explicit `checksums` always win over a seeded SHASUMS file.

- **`electronDist`** — point at a directory containing the Electron zip (or an already-unpacked distribution). This bypasses the download-and-validate pipeline entirely; no SHASUMS handling is involved.

- **`electronGet.unsafelyDisableChecksums: true`** — last resort only: the artifact is used without any integrity verification.

## Toolsets

### Seed the archive, not the extracted tools

Toolset resolution checks electron-builder's own archive cache **before** any network access. Seed the *archive file* at:

```
$ELECTRON_BUILDER_CACHE/<toolset>@<version>/<archive>
# e.g. ~/.cache/electron-builder/appimage@1.1.0/appimage-tools-runtime-20251108.tar.gz
#      ~/.cache/electron-builder/fpm@2.2.1/fpm-1.17.0-ruby-3.4.3-linux-amd64.7z
#      ~/.cache/electron-builder/7zip@1.0.1/7zip-linux-x64.tar.gz
#      ~/.cache/electron-builder/squirrel.windows@1.1.1/squirrel.windows-2.0.1-patched.zip
```

The default cache directory (when `ELECTRON_BUILDER_CACHE` is not set) is `~/.cache/electron-builder` on Linux (respecting `$XDG_CACHE_HOME`), `~/Library/Caches/electron-builder` on macOS, and `%LOCALAPPDATA%\electron-builder\Cache` on Windows.

Notes on the contract:

- The archive's SHA-256 is verified **locally** against the checksum pinned in electron-builder — no checksum file is fetched.
- Extraction happens locally on first use; you do **not** need to seed extracted directories or `.state` marker files.
- Archive names and versions for your electron-builder version can be read from the toolset modules in [`packages/app-builder-lib/src/toolsets`](https://github.com/electron-userland/electron-builder/tree/master/packages/app-builder-lib/src/toolsets), or captured by warming the cache once online.
- **Squirrel.Windows:** the `squirrelWindows` target needs the `squirrel.windows` bundle plus `winCodeSign` (for `rcedit`); `msi: true` additionally needs the `wix-4.0.0.5512.2` bundle.
- **7-Zip bootstrap:** extracting any `.7z` toolset (fpm, NSIS, winCodeSign, the legacy FUSE2 AppImage runtime, Wine) requires the `7zip@1.0.1` toolset. Seed its `.tar.gz` archive as well (it extracts without 7-Zip), or configure `toolsets.sevenZip` with a custom local path.

:::warning[Cache layouts from electron-builder < 26.15 are not read]
Older seeding conventions — extracted tool directories such as `electron-builder/appimage/appimage-12.0.1/` (the layout used by the Go-based downloader) or a flat `electron-v<version>-<platform>-<arch>.zip` at the cache root — are never probed by current versions. Re-seed using the `<toolset>@<version>/<archive>` layout above.
:::

### Alternatives

- **Custom toolsets** — every toolset can be pointed at a local file or directory via the [`toolsets`](../configuration.md) configuration, e.g.:

  ```yaml
  toolsets:
    fpm:
      url: "file:///opt/build-deps/fpm"
  ```

  (a `checksum` is required when `url` points to an archive file rather than a directory).

- **LAN mirror** — `ELECTRON_BUILDER_BINARIES_MIRROR` redirects toolset downloads and `ELECTRON_MIRROR` redirects Electron downloads to an internal HTTP(S) server; not network-free, but internet-free.

## Flatpak target

The `flatpak` target builds on three Flatpak refs that neither cache holds: the runtime, the SDK and the base app (`org.freedesktop.Platform`, `org.freedesktop.Sdk` and `org.electronjs.Electron2.BaseApp` by default, in the configured `runtimeVersion` / `baseVersion`, which both default to `26.08`). They are downloaded by `flatpak` itself into a Flatpak installation (by default `~/.local/share/flatpak` for the user installation), and all three must be installed for a build.

- **Install all three while the machine or image is online.** electron-builder installs whichever of them is missing with `flatpak install --user`, which needs a user-level remote such as Flathub (`flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo`), so a build that has succeeded online leaves all three installed. Offline, a missing ref fails the build with `No remote refs found`. That includes the refs of a new default version after an electron-builder upgrade (v27 changed the default from `20.08` to `26.08`): set `runtimeVersion` and `baseVersion` explicitly to stay on the installed ones — see [Choosing Versions](../flatpak.md#choosing-versions).
- **Once they are installed, the build needs neither the network nor a remote.** electron-builder still runs `flatpak update` for each of the three on every build; offline that prints `Nothing to do.` and exits successfully, and the build continues with the installed versions. Set `flatpak.installOrUpdateRefs` to `[]` to skip the update and the install: a missing ref then fails the build with an error that names it, instead of `No remote refs found` — see [Building With Installed Refs](../flatpak.md#building-with-installed-refs).

`flatpak` and `flatpak-builder` themselves are not toolsets either: they must be installed on the build machine. See [Flatpak](../flatpak.md), and [Building Flatpak Bundles in CI and Containers](flatpak-in-ci-and-containers.md#prepare-the-image) for installing the refs into a container image.

## Environment variables: what works and what doesn't

| Variable | Effect |
| --- | --- |
| `ELECTRON_BUILDER_CACHE` | Overrides the toolset cache root (must be an absolute path). |
| `ELECTRON_DOWNLOAD_CACHE_MODE` | Tunes @electron/get's cache behavior (`0` ReadWrite, `1` ReadOnly, `2` WriteOnly, `3` Bypass). It only controls artifact caching — it never gated the `SHASUMS256.txt` fetch, so it cannot make a build offline by itself. |
| `ELECTRON_SKIP_BINARY_DOWNLOAD`, `ELECTRON_OFFLINE_BUILD` | **No effect on electron-builder.** These are install-time variables for the [`electron` npm package](https://github.com/electron/electron) itself; electron-builder never reads them. |
