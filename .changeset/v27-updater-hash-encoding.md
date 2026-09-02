---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): detect legacy hex `sha512` manifest values strictly and deprecate them for removal in v28

The updater previously used a fuzzy heuristic (looking for `+`, `/`, `Z`, or `=` characters) to decide whether a manifest `sha512` was hex- or base64-encoded. It now uses a strict check: a value that is exactly 128 hexadecimal characters is treated as legacy hex; anything else is decoded as base64, which is what electron-builder has emitted since 19.x (2017). The two forms cannot collide — base64-encoded sha512 is always 88 characters ending in `==` — and a wrong pick can only fail closed with a checksum mismatch.

Hex-encoded `sha512` values (from pre-19.x manifests or hand-rolled manifests built from raw `sha512sum` output) remain accepted in v27 but are deprecated: support will be removed in v28. Emit base64 instead, e.g. `sha512sum file.ext | cut -d' ' -f1 | xxd -r -p | base64 -w0`.

SHA-256 (`sha2`) update checksums are unchanged here — they remain accepted in v27 under the existing v28-removal grace period.
