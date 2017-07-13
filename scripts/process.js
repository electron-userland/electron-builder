"use strict"

const fs = require("fs")
const path = require("path")

exports.getPackages = function () {
  const args = process.argv.slice(2)
  const packageDir = path.join(__dirname, "..", "packages")
  return args.length == 0 ? fs.readdirSync(packageDir).filter(it => !it.includes(".")).sort().map(it => path.join(packageDir, it)) : [args[0]]
}