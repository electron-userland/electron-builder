> !!! This documentation is in "beta" and needed to be tested !!!

## Auto-updates with channels / Releasing with channels

### Description

Channels are usfull to distribute "beta" or "alpha" releases version of your application to a choosen set of your users. This allow your to test your application before release it as a "stable" version.

Users which receivs "beta" version of your app will get "stable" versions too when it will be released. Otherwhise users who doesn't wanna beta version will only get "stable" releases.

They are tree channels level ordered by stability :
1. "stable", your application is stable and this is the default one (example version 1.3.2)
2. "beta" which mean your application works, but should have some bugs (example version 1.3.2-beta)
3. "alpha" which mean your application is not stable and in active development (example version 1.3.2-alpha)

See more about that in xxxxx -> links with more channels informations.


### Configuration

#### Electron-Builder

By default (without using channels), all your application releases use the "stable" channel.

If you want to use channels, you should add this to your package.json

```
"version": "x.x.x-beta",
...
"build": {
  "generateUpdatesFilesForAllChannels": true,
  ...
}
```

> Note: `allowDowngrade` is automatically set to `true` when `generateUpdatesFilesForAllChannels = true`, so you doesn't need to add it.

All you have to do to release version in a channel is to set the `package.json` version. Add "-beta" or "-alpha" (nothing for stable) to the version number to automatically build for the related channel.


#### Your application

All you need to do here is to define which channel the user will receive.

`autoUpdater.setFeedURL({url: 'https://www.yoursite.com', channel: 'beta'});`

> note: remove the need to define url !

The folower related versions will be distributed to the users according to channel you set in `setReedURL()` :
- "stable": users will only get "stable" versions
- "beta": users will get "beta" and "stable" version
- "alpha": users will get "alpha", "beta" and "stable" version


### How to use it / Example

Imagine your application is in version 1.0.1 (stable).

If you want to release a beta for your 1.1.0 version, you only need to define your package.json "version" to "1.1.0-beta".

And when your application is stable enouth and you want to release the version for all your users, only remove the "-beta" tag from your package.json "version".


