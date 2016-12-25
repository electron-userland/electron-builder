"use strict"

const builder = require("electron-builder")

// Promise is returned
builder.build({
  platform: [builder.Platform.MAC],
  "//": "platform, arch and other properties, see PackagerOptions in the node_modules/electron-builder/out/electron-builder.d.ts",
  config: {
    "//": "build options, see https://goo.gl/ZhRfla"
  }
})
  .then(() => {
    // handle result
  })
  .catch((error) => {
    // handle error
  })