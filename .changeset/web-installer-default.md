---
"electron-updater": major
"app-builder-lib": major
---

feat!: NSIS web-installer updates are rejected unless `disableWebInstaller` is `false` (the v27 grace period is removed; cached and install-on-next-launch web updates re-verify the web package), and the nsis-web installer verifies `--package-file` and versioned package downloads against its built-in SHA-512 hashes (opt out with `nsisWeb.allowUnverifiedAppPackage`)
