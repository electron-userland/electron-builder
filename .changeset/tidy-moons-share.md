---
"app-builder-lib": patch
---

fix: cache the pending publisher promise in `PublishManager` so concurrent artifact uploads share one publisher instead of racing to create duplicate GitHub draft releases
