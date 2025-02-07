import typescript from "rollup-plugin-typescript2"
import { defineConfig } from "rollup"
import * as glob from "glob"
import { cleandir } from "rollup-plugin-cleandir"

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

export default () => {
  const outDir = "out"
  return packageMap.map(pkg => {
    const dir = filepath => `packages/${pkg.package}/${filepath}`
    const additionalWatchFiles = glob.sync([dir("tsconfig.json"), dir("package.json"), "**/typings"], { ignore: ["node_modules", "docker-node-modules"] })

    const input = glob.sync(`packages/${pkg.package}/${pkg.entry}`, { ignore: [dir(outDir), "**/*.d.ts"] })
    return defineConfig({
      input,
      treeshake: false,
      output: {
        dir: dir(outDir),
        format: "cjs",
        sourcemap: true,
        preserveModules: true, // Keep files separates instead of one bundled file
      },
      watch: {
        exclude: [dir(outDir)],
      },
      external: id => !/^[./\\]/.test(id),
      plugins: [
        {
          name: "watch-external",
          buildStart() {
            additionalWatchFiles.forEach(file => {
              this.addWatchFile(file)
            })
          },
        },
        cleandir(dir(outDir)),
        typescript({
          tsconfig: dir("tsconfig.json"),
          clean: true,
          check: true,
          abortOnError: true,
        }),
      ],
    })
  })
}
