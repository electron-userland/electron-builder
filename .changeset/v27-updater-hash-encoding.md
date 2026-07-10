---
"builder-util-runtime": patch
---

fix(updater): always decode manifest `sha512` as base64 instead of sniffing hex vs base64

The updater no longer heuristically sniffs whether a manifest `sha512` is hex- or base64-encoded; it now always treats it as base64, which is what electron-builder emits. This removes a crafted-manifest mis-parsing vector.

SHA-256 (`sha2`) update checksums are intentionally not removed here — they remain accepted in v27 under the existing v28-removal grace period.
