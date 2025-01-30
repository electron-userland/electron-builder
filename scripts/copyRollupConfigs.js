const { writeFile, readFile } = require("fs-extra")
const path = require("path")

const packageMap = [
  {
    package: "electron-forge-maker-nsis",
    entry: "main.js",
  },
  {
    package: "electron-updater",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-builder-squirrel-windows",
    entry: "src/**/*.ts",
  },
  {
    package: "app-builder-lib",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-forge-maker-appimage",
    entry: "main.js",
  },
  {
    package: "builder-util",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-builder",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-forge-maker-snap",
    entry: "main.js",
  },
  {
    package: "electron-publish",
    entry: "src/**/*.ts",
  },
  {
    package: "builder-util-runtime",
    entry: "src/**/*.ts",
  },
  {
    package: "electron-forge-maker-nsis-web",
    entry: "main.js",
  },
  {
    package: "dmg-builder",
    entry: "src/**/*.ts",
  },
]

packageMap.forEach(async config => {
  const template = await readFile(path.resolve(__dirname, "rollup.config.ts.template"), "utf8")
  await writeFile(path.resolve(__dirname, "../packages", config.package, "rollup.config.ts"), template.replace("<input_key>", config.entry))
})
