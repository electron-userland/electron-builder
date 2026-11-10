---
"app-builder-lib": major
"electron-builder": major
"builder-util-runtime": major
---

feat!: accept configuration keys only where electron-builder reads them: remove the root `target`, `helperEHBundleId` / `helperNPBundleId`, the `msiWrapped` installer options, `msix.electronUpdaterAware`, `linux.cscLink` / `linux.cscKeyPassword`, `snapcraft.<base>.publish` / `artifactName`, the Linux target options that never had an effect (`deb`/`rpm`/`pacman`/`freebsd`/`p5p`/`apk` `icon`, `freebsd`/`p5p`/`apk` `compression`, `appImage`/`flatpak`/`snapcraft.<base>` `synopsis`), the 21 `mas` / `masDev` options a Mac App Store build never reads (`mas.minimumSystemVersion`, `category` and the Renderer / Plugin / GPU helper bundle ids now apply to the Mac App Store app) and the `publish` fields electron-builder writes into `app-update.yml` itself (new `AppUpdateConfiguration` type; `publish.publisherName` is rejected and no longer overrides the Windows publisher name: set `win.sign.publisherName`); the root `cscLink` / `cscKeyPassword` move to `mac` and `win`, which no longer lose to a root value; `migrate-schema` rewrites them (it warns for `publish.publisherName`) and no longer merges a `snap` into an existing `snapcraft`
