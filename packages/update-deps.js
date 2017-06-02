const BluebirdPromise = require("bluebird-lst")
const spawn = require(__dirname + "/electron-builder-util/out/util.js").spawn

function main() {
  return BluebirdPromise.map(require("./process").getPackages(), projectDir => {
    if (projectDir.includes("electron-forge-maker-")) {
      return
    }

    return spawn("ncu", ["--upgradeAll", "--reject", "electron-builder-http,electron-builder-util,electron-builder-core,electron-publish,electron-forge-maker-appimage,electron-forge-maker-nsis,electron-forge-maker-snap"], {cwd: projectDir, stdio: ["ignore", "inherit", "inherit"]})
  })
}

main()
  .then(() => console.log("done"))
  .catch(error => {
    console.error((error.stack || error).toString())
    process.exit(-1)
  })