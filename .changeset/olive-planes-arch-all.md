---
"electron-builder": major
---

feat!: `createTargets(..., arch: "all")` now expands to x64 + arm64 on Windows and Linux instead of x64 + ia32. Electron 44 removed Windows ia32 builds, and Linux ia32 zips already ended at Electron 19, so the old expansion produced broken or impossible builds on current Electron. Request `ia32` explicitly to keep building it on Electron <= 43.
