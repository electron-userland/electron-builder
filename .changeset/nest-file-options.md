---
"app-builder-lib": major
"electron-builder": patch
---

feat!: nest `files`, `extraResources` and `extraFiles` under `fileOptions`

`PlatformSpecificBuildOptions` no longer extends `FilesBuildOptions`. The three file-copy lists now live in a `fileOptions?: FilesBuildOptions | null` property at the configuration root and in every platform section (`mac`, `mas`, `masDev`, `win`, `linux`), the same way `directories` groups the build directories: `files` becomes `fileOptions.files`, `mac.extraResources` becomes `mac.fileOptions.extraResources`, and so on.

The flat keys keep working in v27. They are moved into `fileOptions` when the configuration is loaded, logging one warning per process that names the keys found and their replacements, and they stay in the TypeScript types (marked `@deprecated`) and in the schema. They are removed in v28. When a flat key and its `fileOptions` counterpart are set on the same object, `fileOptions` wins and the build warns about the conflict. A CLI override (`-c.files=…`) or a parent config's flat key is merged with `fileOptions` as before. A `fileOptions` that is not an object (for example a list of globs written directly under it) fails the build with a message showing the nested form. Plugins that read `config.files` / `extraResources` / `extraFiles` (or the same keys on `platformSpecificBuildOptions`) read them from `fileOptions` instead.

`electron-builder migrate-schema` (static and JS/TS configs) moves the flat keys under `fileOptions` at the root and per platform. A flat key also set under `fileOptions` is removed with a warning, since v27 ignores it.

See https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions
