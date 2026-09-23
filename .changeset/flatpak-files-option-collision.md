---
"app-builder-lib": patch
---

fix(flatpak): stop `linux.files` globs from leaking into the flatpak `files` list. `getOptionsForTarget`'s `deepAssign` concatenated `linux.files` onto `flatpak.files`, and `@malept/flatpak-bundler` then crashed destructuring each glob string as a `[src, dest]` tuple (`ENOENT: no such file or directory, stat '<project-root>/*'`); `FlatpakTarget` now takes `files` from the `flatpak` config only.
