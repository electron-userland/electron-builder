---
"app-builder-lib": patch
---

feat(publish): a build with an rpm target that writes update info warns once when a file of the app (app.asar, its unpacked files or the app directory; not `node_modules`, symlinks or files over 20 MB) contains `allowUnverifiedLinuxPackages = false` (or the minified `allowUnverifiedLinuxPackages=!1`) and the app ships an electron-updater that has the property. With it, electron-updater installs an rpm update only when dnf/yum or zypper verifies its GPG signature, and electron-builder does not sign Linux packages: sign the `.rpm` files after the build, then update their `sha512` and `size` in `latest-linux*.yml` and sign the manifest again, because signing changes the files. The same scan of the app files looks for `crossOriginHeaders`. The check never fails the build. See https://www.electron.build/docs/features/auto-update#allowunverifiedlinuxpackages
