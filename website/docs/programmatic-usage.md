---
title: "Programmatic Usage"
---

:::note
**Node.js >=22.12.0 required.** electron-builder v27 ships as native ESM. CJS `require()` continues to work on Node >=22.12 via Node's stable `require(esm)` support.
:::

The example below uses ESM syntax (recommended). A CJS equivalent is shown at the bottom.

```javascript
import { build, Platform } from "electron-builder"

/**
* @type {import('electron-builder').Configuration}
* @see https://www.electron.build/configuration
*/
const options = {
  protocols: {
    name: "Your Deeplink Example",
    // Don't forget to set `MimeType: "x-scheme-handler/yourdeeplink"` for `linux.desktop` entry!
    schemes: [
      "yourdeeplink"
    ]
  },

  // "store” | “normal” | "maximum". - For testing builds, using 'store' can significantly reduce build time.
  compression: "normal",
  removePackageScripts: true,

  afterSign: async (context) => {
    // Mac releases require hardening+notarization: https://developer.apple.com/documentation/xcode/notarizing_macos_software_before_distribution
    if (!isDebug && context.electronPlatformName === "darwin") {
      await notarizeMac(context)
    }
  },
  artifactBuildStarted: (context) => {
    identifyLinuxPackage(context)
  },
  afterAllArtifactBuild: (buildResult) => {
    return stampArtifacts(buildResult)
  },

  directories: {
    output: "dist/artifacts/local",
    buildResources: "installer/resources"
  },
  files: [
    "out"
  ],
  extraFiles: [
    {
      from: "build/Release",
      to: nodeAddonDir,
      filter: "*.node"
    }
  ],

  win: {
    target: 'nsis'
  },
  nsis: {
    deleteAppDataOnUninstall: true,
    include: "installer/win/nsis-installer.nsh"
  },

  mac: {
    target: 'dmg',
    sign: {
      hardenedRuntime: true,
      gatekeeperAssess: true,
    },
    extendInfo: {
      NSAppleEventsUsageDescription: 'Let me use Apple Events.',
      NSCameraUsageDescription: 'Let me use the camera.',
      NSScreenCaptureDescription: 'Let me take screenshots.',
    }
  },
  dmg: {
    background: "installer/mac/dmg-background.png",
    iconSize: 100,
    contents: [
      {
        x: 255,
        y: 85,
        type: "file"
      },
      {
        x: 253,
        y: 325,
        type: "link",
        path: "/Applications"
      }
    ],
    window: {
      width: 500,
      height: 500
    }
  },

  linux: {
    desktop: {
      StartupNotify: "false",
      Encoding: "UTF-8",
      MimeType: "x-scheme-handler/yourdeeplink"
    },
    target: ["AppImage", "rpm", "deb", "pacman"]
  },
  deb: {
    priority: "optional",
    afterInstall:"installer/linux/after-install.tpl",
  },
  rpm: {
    fpm: ["--before-install", "installer/linux/before-install.tpl"],
    afterInstall:"installer/linux/after-install.tpl",
  }
};

// Promise is returned
const result = await build({
  targets: Platform.MAC.createTarget(),
  config: options
})
console.log(JSON.stringify(result))
```

**CJS equivalent (Node >=22.12.0):**
```javascript
const { build, Platform } = require("electron-builder")

build({
  targets: Platform.MAC.createTarget(),
  config: { /* options */ },
})
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => console.error(error))
```
