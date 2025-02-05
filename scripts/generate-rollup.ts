const { readFileSync, writeFileSync } = require("fs")
const path = require("path")

const packageMap = [
  {
    package: "builder-util-runtime",
    entry: "src/**/*.ts",
  },
  {
    package: "builder-util",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-publish",
    entry: "src/**/*.ts",
  },
  {
    package: "app-builder-lib",
    entry: "src/**/*.ts",
  },
  {
    package: "dmg-builder",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-updater",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-builder",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-builder-squirrel-windows",
    entry: "src/**/*.ts",
  },
  // {
  //   package: "electron-forge-maker-appimage",
  //   entry: "main.js",
  // },
  // {
  //   package: "electron-forge-maker-snap",
  //   entry: "main.js",
  // },
  // {
  //   package: "electron-forge-maker-nsis",
  //   entry: "main.js",
  // },
  // {
  //   package: "electron-forge-maker-nsis-web",
  //   entry: "main.js",
  // },
]

const configData = readFileSync(path.join(__dirname, "template.rollup.config.ts"), "utf-8")

for (const config of packageMap) {
  const dest = path.resolve(__dirname, "../packages", config.package, "rollup.config.ts")
  console.log("writing rollup config: ", dest)
  writeFileSync(dest, configData)
}
