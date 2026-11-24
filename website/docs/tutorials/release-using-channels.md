# Release Using Channels / Auto-Updates With Channels

## Description
Channels are useful to distribute "beta" or "alpha" releases of your application to a chosen set of users. This allows you to test an application before releasing it as "latest" (stable).

Users which receive "beta" version will get "latest" versions too. Otherwise, users who don't want "beta" will only get "latest" releases.

There are three channels, ordered by stability:

1. "latest", your application is stable and this is the default one (example: `1.3.2`),
2. "beta" which means your application works, but should have some bugs (example: `1.3.2-beta`)
3. "alpha" which means your application is not stable and in active development (example: `1.3.2-alpha`)

### Configuration
To release using channels, you should configure electron-builder and define the channels to use on the client side.

### Electron-Builder
By default (without using channels), all application releases use the "latest" channel.

If you want to use channels, you should add this to your package.json:

```json
"version": "x.x.x-beta",
...
"build": {
  "generateUpdatesFilesForAllChannels": true,
  ...
}
```

:::note
`generateUpdatesFilesForAllChannels` does not change `allowDowngrade`: electron-updater never reads it. Setting `autoUpdater.channel` in the app is what sets `allowDowngrade` to `true` (see below).
:::

All you have to do to release using channels is to define the channel in the version tag of the `package.json`. Add "-beta" or "-alpha" (nothing for "latest") to automatically build for the related channel.

:::warning
Github release does not respect the version in the version tag even if `detectUpdateChannel` is true. You must *explicitly* set `channel` (see [GitHub publish options](../publish.md#github-repository-and-bintray-package)) to match the intended release channel.
:::

### Your Application
All you need to do here is to define which channel the user will receive with:

`autoUpdater.channel = "beta"` (see [auto-update documentation](../features/auto-update.md))

:::warning[Setting the channel allows downgrades]
Setting `autoUpdater.channel` also sets `autoUpdater.allowDowngrade` to `true`, so the app then installs any release whose version is lower than its own, from any channel. That includes an older release whose signed `latest*.yml` is served again: a [signed update manifest](../features/signed-update-manifests.md#what-a-signed-manifest-does-not-cover) does not stop a downgrade. If users should not go back to an older release, set `autoUpdater.allowDowngrade = false` after setting the channel.
:::

The following versions will be distributed to users depending on the channel defined:

- `latest` or nothing: users will only get "latest" versions
- `beta`: users will get "beta" and "latest" version
- `alpha`: users will get "alpha", "beta" and "latest" version


## How To Use It
Imagine that your application is stable and in version 1.0.1.

If you want to release a beta for the new 1.1.0 version, you only need to update the `package.json` `version` with `1.1.0-beta`.

When your application is stable enough, you want to release it to all users. For that, you only need to remove the `-beta` label from the package.json `version` tag.
