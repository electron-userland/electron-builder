# Multi Platform Build

:::info
Don't expect that you can build an app for all platforms on one platform.
:::

- If your app has native dependencies, they can only be compiled on the target platform unless [prebuild](https://www.npmjs.com/package/prebuild) is used. Most node modules [don't provide](https://github.com/atom/node-keytar/issues/27) prebuilt binaries.
- macOS Code Signing works only on macOS. [Cannot be fixed](http://stackoverflow.com/a/12156576).

For CI workflow examples across all platforms, see [GitHub Actions](github-actions.md).

## macOS

All required system dependencies (except rpm) are downloaded automatically on demand on macOS 10.12+.

To build rpm:
```bash
brew install rpm
```

## Linux

You can use [Docker](#docker) to avoid installing system dependencies.

To build in distributable format:
```bash
sudo apt-get install --no-install-recommends -y libopenjp2-tools
```

To build rpm:
```bash
sudo apt-get install --no-install-recommends -y rpm
# or
sudo yum install rpm-build
```

To build pacman:
```bash
sudo apt-get install --no-install-recommends -y bsdtar
```

To build snap (only needed with custom stage packages):
```bash
sudo snap install snapcraft --classic
sudo snap install multipass --beta --classic
```

To build flatpak:
```bash
sudo apt-get install -y flatpak flatpak-builder fuse3
```

`flatpak` 1.12.4+ and `flatpak-builder` 1.2.2+ are required: the stock packages of Ubuntu 22.04, Debian 12 and newer releases are new enough. See [Flatpak](../flatpak.md). The [Docker](#docker) images with a date tag newer than `-05.26` include both tools — see [Flatpak in the Docker Images](#flatpak-in-the-docker-images).

### Build for Windows on Linux

[Docker](#docker) (`electronuserland/builder:wine`) is recommended to avoid installing system dependencies.

- Install Wine 2.0+ — see [WineHQ Binary Packages](https://www.winehq.org/download#binary).
- Install [Mono](http://www.mono-project.com/download/#download-lin) 4.2+ if you want to use Squirrel.Windows (NSIS doesn't require Mono).

### Build 32-bit from a 64-bit Machine

```bash
sudo apt-get install --no-install-recommends -y gcc-multilib g++-multilib
```

:::warning[Electron 44 removed 32-bit Windows/Linux]
Windows `ia32` and Linux `armv7l` builds require **`electronVersion` &lt;= 43.x** — [Electron 44 removed them](https://github.com/electron/electron/pull/51816). On Electron 44+ electron-builder fails fast with a configuration error (a warning if a custom `electronDist`/mirror is set). The v43 series is supported until January 2027. See [Build Architectures](../architecture.md#supported-architectures-by-platform).
:::

## Docker

Build Linux or Windows targets on any platform using Docker.

:::warning
You cannot build for Windows using Docker if your app has native dependencies that don't use [prebuild](https://www.npmjs.com/package/prebuild).
:::

:::note
Do not use Docker Toolbox on macOS. Only [Docker for Mac](https://docs.docker.com/docker-for-mac/install/) works.
:::

### Build on a Local Machine

```sh
docker run --rm -ti \
  --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ${PWD##*/}-node-modules:/project/node_modules \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine
```

Then run `yarn && yarn dist` inside the container.

:::tip
If you don't need to build for Windows, use `electronuserland/builder` — Wine is not included in that image.
:::

### Provided Docker Images

:::tip
Lock your `FROM` to a specific date-tag (e.g. `builder:24-07.23`) or digest rather than `latest`, to prevent unexpected toolset upgrades.
:::

:::note[v27 requires Node.js &gt;=22.12]
The images are now published in **Node.js 22 and 24** flavors (e.g. `builder:22`, `builder:24`). The old Node.js 20 tags do not satisfy v27's minimum runtime — use a `22`/`24` tag. See the [tags list](https://hub.docker.com/r/electronuserland/builder/tags).
:::

:::note[Flatpak needs an image newer than -05.26]
Images with a date tag newer than `-05.26`, the first ones published after this release, include `flatpak` and `flatpak-builder` and can build the `flatpak` target. Images with the date tag `-05.26` or an older one include neither tool — see [Flatpak in the Docker Images](#flatpak-in-the-docker-images).
:::

| Image | Contents |
|---|---|
| `electronuserland/builder` or `electronuserland/builder:24` | Node.js 24 (also available as `:22`) + Linux build dependencies. Use for Linux-only targets (for `flatpak`, see [Flatpak in the Docker Images](#flatpak-in-the-docker-images)). |
| `electronuserland/builder:wine` | Wine + Node.js. Use for Windows targets. |
| `electronuserland/builder:wine-mono` | Mono for Squirrel.Windows. |
| `electronuserland/builder:wine-chrome` | `google-chrome-stable` + `xvfb`. Use for headless Electron testing. |
| `electronuserland/builder:base` | System dependencies only. Not meant for direct use. |

Images are also tagged with a date suffix `-%m.%y` (e.g. `builder:24-07.23`) for pinning. Full build script: [build.sh](https://github.com/electron-userland/electron-builder/blob/master/docker/build.sh)

### Flatpak in the Docker Images

Images with a date tag newer than `-05.26` include `flatpak` and `flatpak-builder` — every variant in the table above, since all of them are built on `base`. The tools come from the Flatpak team's PPA (`ppa:flatpak/stable`) rather than from Ubuntu 22.04, which the images are based on: its own packages (Flatpak 1.12.7, `flatpak-builder` 1.2.2) meet the [requirements](../flatpak.md#build-requirements), but `flatpak-builder` 1.4 and newer also handle AppStream metadata with the current SDKs, and 1.4.4 and newer meson and cmake modules. In October 2026 the PPA provided Flatpak 1.18.4 and `flatpak-builder` 1.4.8 for Ubuntu 22.04. Together with `elfutils` and `zstd`, two packages that `flatpak-builder` recommends, the tools add about 62 MB to an image.

:::note[Images up to -05.26]
The images with the date tag `-05.26`, published in May 2026, and all older ones include neither tool: the `flatpak` target fails in them with `cannot run flatpak - flatpak and flatpak-builder must be installed to build the flatpak target`. An undated tag (`latest`, `24`, `wine`, …) has the tools once it points to a newer image: the [tags list](https://hub.docker.com/r/electronuserland/builder/tags) shows whether a date tag newer than `-05.26` exists. Pull the tag again if your copy is older. To check an image:

```sh
docker run --rm electronuserland/builder flatpak --version
```

This prints the version of `flatpak`, or fails with `exec: "flatpak": executable file not found in $PATH`. For an image without the tools, [Prepare the Image](../tutorials/flatpak-in-ci-and-containers.md#prepare-the-image) shows how to build one of your own.
:::

The images contain no runtime, SDK or base app. The first `flatpak` build in a container downloads them from Flathub and installs them into the user installation of `root`, `/root/.local/share/flatpak` — see [Installation and Updates](../flatpak.md#installation-and-updates). For the default version, `26.08`, on x86_64 (the images are `linux/amd64` only), Flathub listed these download sizes in October 2026: 281.7 MB for the runtime, 656.9 MB for the SDK, 3.0 MB for the base app and 1.1 GB for the refs that `flatpak` installs with them — the locale data of the runtime and of the SDK in all languages, two branches of the GL extension and a codecs extension — about 2 GB together. Installed, they took 3.2 GB.

To keep them between runs, mount a named volume over the user installation: add this line to the [command above](#build-on-a-local-machine), before the name of the image.

```sh
  -v electron-builder-flatpak:/root/.local/share/flatpak \
```

Use a named volume, not a host directory. Docker copies what the image has in that directory, the Flathub remote, into a new named volume, whereas a host directory hides it.

A container started with that command is not privileged, so the build needs the two additional arguments that every unprivileged container needs — see [Building in unprivileged containers](../flatpak.md#building-in-unprivileged-containers):

```yaml
flatpak:
  additionalArgs:
    flatpakBuilder:
      - "--disable-rofiles-fuse"
    buildExport:
      - "--disable-sandbox"
```

Then build inside the container once the dependencies are installed, for example with `npx electron-builder --linux flatpak`.

Flathub is a remote of the user installation of `root`, the user the images run as, with `HOME=/root`. A container that runs as another user or with another `HOME` does not see that remote — a GitHub Actions job that runs in a `container`, for example, has `HOME` set to `/github/home` — and the build fails with `No remote refs found`. Add the remote there before the build:

```sh
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

A build that does not run as root also needs a `dbus-run-session` wrapper. For that and for CI, see [Building Flatpak Bundles in CI and Containers](../tutorials/flatpak-in-ci-and-containers.md#electronuserland-builder-image).
