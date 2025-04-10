macOS code signing is supported. If the configuration values are provided correctly in your package.json, then signing should be automatically executed.

On a macOS development machine, a valid and appropriate identity from your keychain will be automatically used. If no such identity exists, the default behavior depends on the target architecture. On ARM or universal builds, an ad-hoc signature will be applied by default. On Intel-only builds, the default behavior is to not sign at all.

!!! tip
    See article [Notarizing your Electron application](https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/).

## How to Export Certificate on macOS

1. Open Keychain.
2. Select `login` keychain, and `My Certificates` category.
3. Select all required certificates (hint: use cmd-click to select several):
   * `Developer ID Application:` to sign app for macOS.
   * `3rd Party Mac Developer Installer:` and either `Apple Distribution` or `3rd Party Mac Developer Application:` to sign app for MAS (Mac App Store).
   * `Developer ID Application:` and `Developer ID Installer` to sign app and installer for distribution outside of the Mac App Store.
   * `Apple Development:` or `Mac Developer:` to sign development builds for testing Mac App Store submissions (`mas-dev` target). You also need a provisioning profile in the working directory that matches this certificate and the device being used for testing.

   Please note – you can select as many certificates as needed. No restrictions on electron-builder side.
   All selected certificates will be imported into temporary keychain on CI server.
4. Open context menu and `Export`.

## How to Disable Code Signing During the Build Process on macOS

To disable Code Signing when building for macOS leave all the above vars unset except for `CSC_IDENTITY_AUTO_DISCOVERY` which needs to be set to `false`. This can be done by running `export CSC_IDENTITY_AUTO_DISCOVERY=false`.

Another way — set `mac.identity` to `null`. You can pass additional configuration using CLI as well: `-c.mac.identity=null`. If you are building for ARM, you likely actually want to use ad-hoc signing, in which case you should set `mac.identity` to `-`.

## Code Signing and Notarization Tutorial
Thank you to a community member for putting this together.

<iframe width="560" height="315" src="https://www.youtube.com/embed/hYBLfjT57hU?si=lADhxKdYM_5mHsPo" title="MacOS Code Signing in Electron" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>