---
"app-builder-lib": major
"electron-builder": patch
"builder-util-runtime": patch
---

feat!: nest `files`, `extraResources` and `extraFiles` under `fileOptions`

The three file-copy lists live in a `fileOptions?: FilesBuildOptions | null` property at the configuration root and in every platform section (`mac`, `mas`, `masDev`, `win`, `linux`), the same way `directories` groups the build directories: `fileOptions.files`, `mac.fileOptions.extraResources`, and so on. `PlatformSpecificBuildOptions` does not extend `FilesBuildOptions`, and the TypeScript types and the JSON schema only have `fileOptions`.

Flat `files` / `extraResources` / `extraFiles` keys in a config file, an `extends` parent, a `-c.files=…` override or the `config` object passed to `build()` are applied as their `fileOptions` counterparts before the configuration is validated, logging one warning per process that names the keys found and where they belong. When a flat key and its `fileOptions` counterpart are set on the same object, `fileOptions` wins and the build warns about the conflict. A CLI override or a parent config's flat key is merged with `fileOptions`. A `fileOptions` that is not an object (for example a list of globs written directly under it) fails the build with a message showing the nested form.

Code that reads `files`, `extraResources` or `extraFiles` from the loaded configuration (for example a hook reading `context.packager.config.files`, or `buildResult.configuration.extraResources`) gets the `fileOptions` value, with a warning per key: the loaded configuration and its platform sections forward these reads through non-enumerable properties, which stay out of the effective config, `JSON.stringify` and `Object.keys`. Assigning them throws a configuration error naming the `fileOptions` property to set instead.

`deepAssign` (builder-util-runtime) copies only enumerable own properties, so the forwarding properties are never copied into merged options.

`electron-builder migrate-schema` (static and JS/TS configs) moves flat keys under `fileOptions` at the root and per platform. A flat key also set under `fileOptions` is removed with a warning, since the build ignores it.

See https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions
