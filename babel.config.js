"use strict"

module.exports = function (api) {
  // babel 7 requires this string to revalidate cache of config on env change
  api.env()
  return {
    "plugins": [
      [
        require("@babel/plugin-transform-modules-commonjs"),
        {
          lazy: string => string !== "debug" && string !== "path" && string !== "fs"
        }
      ],
      "./scripts/babel-plugin-version-transform.js",
    ]
  }
}