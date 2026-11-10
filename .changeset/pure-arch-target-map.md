---
"app-builder-lib": patch
---

fix: build each arch's own configured targets when the requested archs share one target list (e.g. `--win --x64 --ia32` with `win.target` set per arch), and stop the build from changing the requested `targets`
