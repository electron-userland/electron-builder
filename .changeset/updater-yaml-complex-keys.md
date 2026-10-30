---
"electron-updater": patch
---

fix(updater): count YAML aliases against the update manifest's alias budget while the manifest is loaded, so a `latest*.yml` whose non-scalar mapping keys (`? [*a, *a, ...]`) expand into very long strings is rejected with `ERR_UPDATER_INVALID_UPDATE_INFO` before it can exhaust memory
