---
"app-builder-lib": patch
---

fix(mac): bump linux-tools-mac toolset to 1.0.1, rebuilt on macOS 15 runners so its gtar/lzip/ar binaries run on macOS 15+ instead of requiring macOS 26; also download custom `toolsets.*.url` bundles from the configured URL as-is instead of appending the filename again (fixes #10084)
