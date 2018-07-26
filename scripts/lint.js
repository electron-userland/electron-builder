"use strict"

const path = require("path")
const run = require("tslint/lib/runner").run

module.exports = function (projectDir, callback) {
  // console.log(`Linting ${projectDir}`)
  run({
    config: path.join(process.cwd(), "node_modules/electron-builder-tslint-config/tslint.json"),
    format: "stylish",
    project: projectDir,
    exclude: [],
    files: [],
  }, {log: (m) => {
    if (m != "\n") {
      console.log(m)
    }
  }, error: m => console.error(m)})
    .then(exitCode => {
      process.exitCode = exitCode
      callback(null, exitCode != 0)
    })
    .catch(e => {
      console.error(e)
      callback(null, true)
    })
}