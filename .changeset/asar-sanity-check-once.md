---
"app-builder-lib": patch
---

fix: the `app.asar` sanity check reads the archive header once per archive instead of once per checked file, and checks the entry file and `package.json` against a header read from the archive on disk, so a build to the same output path earlier in the same process cannot fail it. The warning for a header that describes more bytes than the archive has is logged once per process and says that afterPack hooks that patch the header (such as asarmor) cause it, and that `asar.disableSanityCheck` skips the check. With `asar.stableLayout` set, the archive is checked against its header before it is re-laid out too, the same as with `asar.contentAlignment`.
