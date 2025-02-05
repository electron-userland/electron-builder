import typescript from "rollup-plugin-typescript2"
import { defineConfig } from "rollup"
import * as glob from "glob"
import { cleandir } from "rollup-plugin-cleandir"
import path from "path"

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
    const dir = path.resolve(process.cwd(), `packages/${pkg.package}/${outDir}`)
    const input = glob.sync(`packages/${pkg.package}/${pkg.entry}`, { ignore: [dir, "**/*/*.d.ts"] })
    return defineConfig({
      input,
      treeshake: false,
      output: {
        dir: dir,
        format: "cjs",
        sourcemap: true,
        preserveModules: true, // Keep files separates instead of one bundled file
      },
      watch: {
        exclude: [dir],
      },
      plugins: [
        cleandir(dir),
        typescript({
          tsconfig: `packages/${pkg.package}/tsconfig.json`,
          clean: true,
          check: true,
        }),
      ],
    })
  })
}
