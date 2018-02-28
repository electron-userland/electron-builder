<a name="release_using_channels"></a>
# Release Using Channels / Auto-Updates With Channels

## Description
Channels are useful to distribute "beta" or "alpha" releases of your application to a choosen set of users. This allow to test an application before release it as "stable".

Users which receive "beta" version will get "stable" versions too. Otherwise users who doesn't wanna "beta" will only get "stable" releases.

They are tree channels level ordered by stability :
1. "stable", your application is stable and this is the default one (example: "1.3.2")
2. "beta" which mean your application works, but should have some bugs (example: "1.3.2-beta")
3. "alpha" which mean your application is not stable and in active development (example: "1.3.2-alpha")


## Configuration
To release using channels, you should config electron-builder and define the channels to use in client side.

### Electron-Builder
By default (without using channels), all application releases use the "stable" channel.

If you want to use channels, you should add this to your package.json:

```
"version": "x.x.x-beta",
...
"build": {
  "generateUpdatesFilesForAllChannels": true,
  ...
}
```

> Note: `allowDowngrade` is automatically set to `true` when `generateUpdatesFilesForAllChannels = true`, so you doesn't need to set it.

All you have to do to release using channels is to define the channel in the version tag of the `package.json`. Add "-beta" or "-alpha" (nothing for stable) to automatically build for the related channel.


### Your Application
All you need to do here is to define which channel the user will receive with:

`autoUpdater.channel = 'beta'` (see [the documentation here](../auto-update.md#module_electron-updater.AppUpdater+channel))

The following versions will be distributed to users depending on the channel defined:
- "stable" or nothing: users will only get "stable" versions
- "beta": users will get "beta" and "stable" version
- "alpha": users will get "alpha", "beta" and "stable" version


## How To Use It / Example
Imagine your application version is 1.0.1 (stable).

If you want to release a beta for the 1.1.0 version, you only need to update the package.json "version" with "1.1.0-beta".

And when your application is stable enouth and you want to release it to all users, only remove the "-beta" tag from the package.json "version" tag.


