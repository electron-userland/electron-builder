---
"app-builder-lib": major
"electron-builder": patch
"builder-util-runtime": patch
---

feat!: nest `files`, `extraResources` and `extraFiles` under `fileOptions`

`PlatformSpecificBuildOptions` no longer extends `FilesBuildOptions`. The three file-copy lists now live in a `fileOptions?: FilesBuildOptions | null` property at the configuration root and in every platform section (`mac`, `mas`, `masDev`, `win`, `linux`), the same way `directories` groups the build directories: `files` becomes `fileOptions.files`, `mac.extraResources` becomes `mac.fileOptions.extraResources`, and so on. The flat keys are removed from the TypeScript types and from the JSON schema.

The v26 flat keys are still accepted at runtime in v27. In a config file, an `extends` parent, a `-c.files=…` override or the `config` object passed to `build()`, they are moved into `fileOptions` before the configuration is validated, logging one warning per process that names the keys found and their replacements. When a flat key and its `fileOptions` counterpart are set on the same object, `fileOptions` wins and the build warns about the conflict. A CLI override or a parent config's flat key is merged with `fileOptions` as before. A `fileOptions` that is not an object (for example a list of globs written directly under it) fails the build with a message showing the nested form.

Code that reads the flat keys from the loaded configuration (for example a hook reading `context.packager.config.files`, or `buildResult.configuration.extraResources`) still gets the `fileOptions` value, with a warning per key: the loaded configuration and its platform sections forward these reads through non-enumerable properties, which stay out of the effective config, `JSON.stringify` and `Object.keys`. Assigning them throws a configuration error naming the `fileOptions` property to set instead.

`deepAssign` (builder-util-runtime) now copies only enumerable own properties, so the forwarding properties are never copied into merged options.

`electron-builder migrate-schema` (static and JS/TS configs) moves the flat keys under `fileOptions` at the root and per platform. A flat key also set under `fileOptions` is removed with a warning, since v27 ignores it.

See https://www.electron.build/docs/migration/v27-breaking-changes#file-options-fileoptions
