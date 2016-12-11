"use strict"

const builder = require("electron-builder")

// Promise is returned
builder.build({
  platform: [builder.Platform.MAC],
  "//": "platform, arch and other properties, see PackagerOptions in the node_modules/electron-builder/out/electron-builder.d.ts",
  config: {
    "//": "build and other properties, see https://goo.gl/5jVxoO"
  }
})
  .then(() => {
    // handle result
  })
  .catch((error) => {
    // handle error
  })