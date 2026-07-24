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

### Build for Windows on Linux

[Docker](#docker) (`electronuserland/builder:wine`) is recommended to avoid installing system dependencies.

- Install Wine 2.0+ — see [WineHQ Binary Packages](https://www.winehq.org/download#binary).
- Install [Mono](http://www.mono-project.com/download/#download-lin) 4.2+ if you want to use Squirrel.Windows (NSIS doesn't require Mono).

### Build 32-bit from a 64-bit Machine

```bash
sudo apt-get install --no-install-recommends -y gcc-multilib g++-multilib
```

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

| Image | Contents |
|---|---|
| `electronuserland/builder` or `electronuserland/builder:24` | Node.js 24 (also available as `:22`) + Linux build dependencies. Use for Linux-only targets. |
| `electronuserland/builder:wine` | Wine + Node.js. Use for Windows targets. |
| `electronuserland/builder:wine-mono` | Mono for Squirrel.Windows. |
| `electronuserland/builder:wine-chrome` | `google-chrome-stable` + `xvfb`. Use for headless Electron testing. |
| `electronuserland/builder:base` | System dependencies only. Not meant for direct use. |

Images are also tagged with a date suffix `-%m.%y` (e.g. `builder:24-07.23`) for pinning. Full build script: [build.sh](https://github.com/electron-userland/electron-builder/blob/master/docker/build.sh)
