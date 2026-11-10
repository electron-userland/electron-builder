---
"app-builder-lib": patch
---

fix(nsis): update the default `nsis` toolset to `2.0.4` (NSIS 3.13 compiled from source, with the plugin and `elevate.exe` license files and the Unicode `nsisunz` fix). The release has two bundles, and electron-builder picks `nsis-bundle-3.13-log.tar.gz` (`makensis` and stubs compiled with `NSIS_CONFIG_LOG=yes`) when `installerDebugLogging` is on and `nsis-bundle-3.13.tar.gz` otherwise, so `installerDebugLogging` now works with the default toolset instead of needing a custom bundle. Pinning `toolsets.nsis` to `"1.2.1"` or `"0.0.0"` keeps the earlier bundles, which are not log-enabled. The uninstaller is still extracted from the installer without running it (no Wine needed on macOS and Linux) with the 2.0.4 stubs, which are built with MinGW and have more PE sections than the earlier ones
