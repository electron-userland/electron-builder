# docker

## 26.12.0-alpha.1
### Patch Changes

- Chore(docker): update Node.js 24 to 24.22.0 and Node.js 22 to 22.23.3 in the images _[`#10341`](https://github.com/electron-userland/electron-builder/pull/10341) [`6ef5c23`](https://github.com/electron-userland/electron-builder/commit/6ef5c230a6cabacb526a2dd8411aaaaeb2f5fd89)_
- Chore(docker): update Node.js 24 to 24.22.1 and Node.js 22 to 22.23.4 in the images (October 2026 security releases) _[`#10381`](https://github.com/electron-userland/electron-builder/pull/10381) [`5172ff6`](https://github.com/electron-userland/electron-builder/commit/5172ff6a3c59f11f490834439912bd41b9b54bdc)_

## 26.12.0-alpha.0
### Minor Changes

- Feat(docker): install `flatpak` and `flatpak-builder` (from the Flatpak team's PPA), `elfutils`, `zstd` and `fuse3` in the base image, and add the `flathub` remote for root, so every image can build the flatpak target _[`#10334`](https://github.com/electron-userland/electron-builder/pull/10334) [`8aefb0b`](https://github.com/electron-userland/electron-builder/commit/8aefb0b567d4b77a3fc2af86796e537687db1c2e)_
