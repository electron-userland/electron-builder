---
"app-builder-lib": patch
---

fix: extract `.tar.7z` snap template archives through both compression layers. Since 26.15.0, default-config snap builds packed the template's inner tar as a single file instead of its contents (`desktop-init.sh` etc.), producing snaps that built successfully but failed at launch. The toolset cache directory name for `.tar.7z` archives also changes, so caches poisoned by the broken extraction are automatically re-fetched after upgrading.
