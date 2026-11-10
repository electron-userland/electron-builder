---
"app-builder-lib": patch
---

fix: update the default `sevenZip` toolset to `1.1.0`. It bundles 7-Zip 26.05 (was 24.09), which picks up upstream security fixes including CVE-2025-11001 / CVE-2025-11002 (ZIP symlink path traversal), CVE-2025-55188 (symlink handling) and CVE-2026-14266 (XZ decoder heap overflow). Explicit `toolsets.sevenZip` pins (`1.0.0`, `1.0.1`) are unchanged
