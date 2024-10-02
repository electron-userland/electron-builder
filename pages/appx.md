The top-level [appx](configuration.md#appx) key contains set of options instructing electron-builder on how it should build AppX (Windows Store).

All options are optional. All required for AppX configuration is inferred and computed automatically.

## AppX Package Code Signing

* If the AppX package is meant for enterprise or self-made distribution (manually install the app without using the Store for testing or for enterprise distribution), it must be [signed](./code-signing.md).
* If the AppX package is meant for Windows Store distribution, no need to sign the package with any certificate. The Windows Store will take care of signing it with a Microsoft certificate during the submission process.

## AppX Assets

AppX assets need to be placed in the `appx` folder in the [build](configuration.md#MetadataDirectories-buildResources) directory.

The assets should follow these naming conventions:

- Logo: `StoreLogo.png`
- Square150x150Logo: `Square150x150Logo.png`
- Square44x44Logo: `Square44x44Logo.png`
- Wide310x150Logo: `Wide310x150Logo.png`
- *Optional* BadgeLogo: `BadgeLogo.png`
- *Optional* Square310x310Logo: `LargeTile.png`
- *Optional* Square71x71Logo: `SmallTile.png`
- *Optional* SplashScreen: `SplashScreen.png`

All official AppX asset types are supported by the build process. These assets can include scaled assets by using `target size` and `scale` in the name.
See [Guidelines for tile and icon assets](https://docs.microsoft.com/en-us/windows/uwp/controls-and-patterns/tiles-and-notifications-app-assets) for more information.

Default assets will be used for `Logo`, `Square150x150Logo`, `Square44x44Logo` and `Wide310x150Logo` if not provided. For assets marked `Optional`, these assets will not be listed in the manifest file if not provided.

## How to publish your Electron App to the Windows App Store

1. You'll need a microsoft developer account (pay some small fee). Use your favourite search engine to find the registration form.
2. Register you app for the desktop bridge [here](https://developer.microsoft.com/en-us/windows/projects/campaigns/desktop-bridge).
3. Wait for MS to answer and further guide you.
4. In the meantime, build and test your appx. It's dead simple.

  ```json
   "win": {
     "target": "appx",
   },
   ```
5. The rest should be pretty straight forward — upload the appx to the store and wait for approval.

## Building AppX on macOS

The only solution for now — using [Parallels Desktop for Mac](http://www.parallels.com/products/desktop/) ([Pro Edition](https://forum.parallels.com/threads/prlctl-is-now-a-pro-or-business-version-tool-only.330290/) is required). Create Windows 10 virtual machine and start it. It will be detected and used automatically to build AppX on your macOS machine. Nothing is required to setup on Windows. It allows you to not copy project to Windows and to not setup build environment on Windows.

## Common Questions
#### How do install AppX without trusted certificate?

If you use self-signed certificate, you need to add it to "Trusted People". See [Install the certificate](https://stackoverflow.com/a/24372483/1910191).

## Configuration

{!./app-builder-lib.Interface.AppXOptions.md!}