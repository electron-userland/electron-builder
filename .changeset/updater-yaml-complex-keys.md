---
"electron-updater": patch
---

fix(updater): count YAML aliases against the update manifest's alias budget while the manifest is loaded, so a `latest*.yml` whose non-scalar mapping keys (`? [*a, *a, ...]`) expand into very long strings is rejected with `ERR_UPDATER_INVALID_UPDATE_INFO` before the strings are built. An alias counts at least as many characters as it adds to such a key, so an aliased timestamp counts as about 60 characters and an aliased number by the length of its text
