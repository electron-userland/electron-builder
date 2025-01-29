const { writeFile, readFile } = require("fs-extra")
const path = require("path")

const packageMap = [
  {
    package: "electron-forge-maker-nsis",
    entry: "src/index.ts",
  },
  {
    package: "electron-updater",
    entry: "src/main.ts",
  },
  {
    package: "electron-builder-squirrel-windows",
    entry: "src/index.ts",
  },
  {
    package: "app-builder-lib",
    entry: "src/index.ts",
  },
  {
    package: "electron-forge-maker-appimage",
    entry: "src/index.ts",
  },
  {
    package: "builder-util",
    entry: "src/util.ts",
  },
  {
    package: "electron-builder",
    entry: "src/index.ts",
  },
  {
    package: "electron-forge-maker-snap",
    entry: "src/index.ts",
  },
  {
    package: "electron-publish",
    entry: "src/index.ts",
  },
  {
    package: "builder-util-runtime",
    entry: "src/index.ts",
  },
  {
    package: "electron-forge-maker-nsis-web",
    entry: "src/index.ts",
  },
  {
    package: "dmg-builder",
    entry: "src/dmgUtil.ts",
  },
]

packageMap.forEach(async config => {
  const template = await readFile(path.resolve(__dirname, "rollup.config.ts.template"), "utf8")
  await writeFile(path.resolve(__dirname, "../packages", config.package, "rollup.config.ts"), template.replace("<input_key>", config.entry))
})
