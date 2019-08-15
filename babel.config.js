"use strict";

// bloody babel 7 requires to use ONLY babel.config.js and old convenient key in package.json or .babelrc ARE NOT SUPPORTED ANYMORE
module.exports = function (api) {
  // bloody babel 7 requires this string to revalidate cache of config on env change
  api.env()
  return {
    "presets": [
      "babel-preset-ts-node8",
    ],
    "plugins": [
      "./scripts/babel-plugin-version-transform.js",
    ]
  }
}