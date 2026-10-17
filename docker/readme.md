It is developer documentation. See [user documentation](https://www.electron.build/docs/features/multi-platform-build#docker).

# Build

`pnpm docker-images`

# Notes

* We use [named data volume](https://madcoda.com/2016/03/docker-named-volume-explained/) instead of mounted host directory to store `node_modules` because NPM is unreliable and NPM team [doesn't want to fix it](https://github.com/npm/npm/issues/3565).

  `${PWD##*/}-node-modules` is used as name of data volume — it is your current directory name (e. g. `foo`) and suffix `-node-modules`.

  As downside, you have to manually clear outdated data volumes, use `docker volume rm your-name`.

* `flatpak` and `flatpak-builder` are installed in the `base` image, so every image has them. They come from the Flatpak team's PPA (`ppa:flatpak/stable`, signing key pinned by its fingerprint) and not from Ubuntu. Ubuntu 22.04's own packages (1.12.7 and 1.2.2) meet the flatpak target's minimum, but flatpak-builder 1.4 and newer also handle AppStream metadata with the current SDKs, and 1.4.4 and newer meson and cmake modules. The versions follow the PPA. `elfutils` and `zstd`, which flatpak-builder recommends, and `fuse3`, whose `fusermount3` flatpak-builder's `rofiles-fuse` needs, are installed with them from Ubuntu.

  No runtime, SDK or base app is installed — a build downloads what it needs from the `flathub` remote. The remote is added with `--user` for root, the user the images run as, because the flatpak target installs into the user installation. A container that runs as another user or with another `HOME` does not see it.

  See [user documentation](https://www.electron.build/docs/features/multi-platform-build#flatpak-in-the-docker-images).