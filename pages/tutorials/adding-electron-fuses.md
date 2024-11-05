!!! note
    Information below has been partially copied from integration with [@electron/fuses](https://github.com/electron/fuses) and [electron tutorial](https://raw.githubusercontent.com/electron/electron/refs/heads/main/docs/tutorial/fuses.md) for easier reading/access.

## What are fuses?

For a subset of Electron functionality it makes sense to disable certain features for an entire application.  For example, 99% of apps don't make use of `ELECTRON_RUN_AS_NODE`, these applications want to be able to ship a binary that is incapable of using that feature.  We also don't want Electron consumers building Electron from source as that is both a massive technical challenge and has a high cost of both time and money.

Fuses are the solution to this problem, at a high level they are "magic bits" in the Electron binary that can be flipped when packaging your Electron app to enable / disable certain features / restrictions.  Because they are flipped at package time before you code sign your app the OS becomes responsible for ensuring those bits aren't flipped back via OS level code signing validation (Gatekeeper / App Locker).

## How do I flip the fuses?

Under-the-hood, electron-builder leverages the official [`@electron/fuses`](https://npmjs.com/package/@electron/fuses) module to make flipping these fuses easy. Previously, electron fuses could only be flipped within the `afterPack` hook (this is still a supported method). Now, you can instead set electron-builder configuration property `electronFuses: FuseOptionsV1` to activate electron-builder's integration.

### Example
!!! note
    The true/false below are just an example, customize your configuration to your own requirements

```typescript
electronFuses: {
  runAsNode: false,
  enableCookieEncryption: true,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  loadBrowserProcessSpecificV8Snapshot: false,
  grantFileProtocolExtraPrivileges: false
}
```

It also is still possible to continue to keep your current logic flow in `afterPack` hook, so a convience method has been exposed in the `PlatformPackager` for easy customization of the flags on your own. It directly accepts an `AfterPackContext` and a `FuseConfig` object of [type](https://github.com/electron/fuses/blob/main/src/config.ts).
This convience method was opened so that custom FuseConfig's could be provided, allow usage of `strictlyRequireAllFuses` to monitor your fuses and stay up-to-date with fuses as they're released, and/or force override the version of @electron/fuses in electron-builder if there's an update you'd like to leverage.

!!! example "afterPack.ts"

```typescript
const { FuseConfig, FuseVersion, FuseV1Options } = require("@electron/fuses")

exports.default = function (context: AfterPackContext) {
  const fuses: FuseConfig = {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    ... // all other flags must be specified since `strictlyRequireAllFuses = true`
  }
  await context.packager.addElectronFuses(context, fuses)
}
```

## Validating Fuses

You can validate the fuses have been flipped or check the fuse status of an arbitrary Electron app using the fuses CLI.

```bash
npx @electron/fuses read --app /Applications/Foo.app
```

## Typedoc
  {!./app-builder-lib.Interface.FuseOptionsV1.md!}