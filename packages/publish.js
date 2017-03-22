"use strict"

const path = require("path")
const exec = require(path.join(__dirname, "electron-builder-util", "out", "util")).exec

async function main() {
  for (const projectDir of require("./process").getPackages()) {
    await exec("npm", ["publish"])
      .catch(e => console.log(`Cannot publish ${projectDir}: ${e.message}`))
  }
}

main()
  .catch(error => {
    console.error((error.stack || error).toString())
    process.exit(-1)
  })