"use strict"

Object.defineProperty(exports, "__esModule", {
  value: true
})

const buildForge = require("electron-builder").buildForge

exports.default = function (appDir, appName, targetArch) {
  return buildForge(appDir, {win: [`nsis-web:${targetArch}`]})
}