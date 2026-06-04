---
"app-builder-lib": minor
"builder-util": minor
---

chore: replace app-builder-bin `snap` and `wine` commands with pure-TS equivalents; `executeAppBuilder` and `app-builder-bin` package fully removed from codebase; snap templates now downloaded via `downloadBuilderToolset` with pinned checksums; Wine is downloaded automatically on macOS (legacy 4.0.1 bundle by default, Wine 11 bundle available via `toolsets.wine: "1.0.1"`); on Linux with legacy config and when `USE_SYSTEM_WINE=true`, system wine is used instead
