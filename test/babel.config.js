"use strict"

module.exports = {
  presets: [
    ["@babel/preset-env", {targets: {node: "current"}}],
    "@babel/preset-typescript",
  ],
  "ignore": [
    "../.yarn",
  ]
}