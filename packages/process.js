"use strict"

const fs = require("fs")
const path = require("path")

exports.getPackages = function () {
  const args = process.argv.slice(2)
  return args.length == 0 ? fs.readdirSync(__dirname).filter(it => !it.includes(".")).sort().map(it => path.join(__dirname, it)) : [args[0]]
}