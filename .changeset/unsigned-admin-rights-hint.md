---
"builder-util-runtime": patch
"electron-updater": patch
---

docs: document `files[].isAdminRightsRequired` as an intentionally unsigned launch hint in signed update manifests. It only selects how the hash-verified installer is launched (directly or via `elevate.exe`), so publishers can correct it in `latest.yml` without re-signing.
