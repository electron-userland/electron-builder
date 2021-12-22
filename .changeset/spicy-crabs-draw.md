---
"app-builder-lib": minor
---

Default to LZO compression for snap packages.
This greatly improves cold startup performance (https://snapcraft.io/blog/why-lzo-was-chosen-as-the-new-compression-method).
LZO has already been adopted by most desktop-oriented snaps outside of the Electron realm.

For the rare case where developers prefer a smaller file size (XZ) to vastly improved decompression performance (LZO),
provide an option to override the default compression method.

Consumers do not need to update their configuration unless they specifically want to stick to XZ compression.
