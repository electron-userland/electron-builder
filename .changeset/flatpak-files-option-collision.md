---
"app-builder-lib": patch
---

fix(flatpak): don't let `linux.files` corrupt the flatpak `files` option. `FlatpakTarget`'s `files` option (`[string, string][]` copy tuples) is merged with the shared `linux.files` option (a `string[]` of glob include/exclude patterns for general app packaging) via `getOptionsForTarget`'s `deepAssign`, which concatenates array properties instead of replacing them — so setting `linux.files` (the common case) silently corrupted the flatpak-specific `files` list. `@malept/flatpak-bundler` then destructured each entry as `[src, dest]`; for a plain glob string this iterates its characters instead, producing a bogus path and crashing the build with `ENOENT: no such file or directory, stat '<project-root>/*'`. The merged list is now filtered down to actual `[string, string]` tuples before being passed to `flatpak-bundler`.
