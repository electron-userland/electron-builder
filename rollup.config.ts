import * as glob from "glob"
import path from "path"
import { defineConfig } from "rollup"
import typescript2 from "rollup-plugin-typescript2"

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
  {
    package: "electron-forge-maker-appimage",
    entry: "main.js",
  },
  {
    package: "electron-forge-maker-snap",
    entry: "main.js",
  },
  {
    package: "electron-forge-maker-nsis",
    entry: "main.js",
  },
  {
    package: "electron-forge-maker-nsis-web",
    entry: "main.js",
  },
]

const outputOptions = {
  exports: "named",
  preserveModules: true,
  sourcemap: true,
  // Ensures that CJS default exports are imported properly (based on __esModule)
  // If needed, can switch to 'compat' which checks for .default prop on the default export instead
  // see https://rollupjs.org/configuration-options/#output-interop
  interop: "auto",
}

export default () => {
  const outDir = "out"
  return packageMap.map(pkg => {
    const dir = p => path.resolve("packages", pkg.package, p)
    const input = glob.sync(dir(pkg.entry), { ignore: [dir(outDir), "**/*/*.d.ts"] })
    return defineConfig({
      // @ts-ignore
      input,
      treeshake: false,
      output: [
        {
          dir: dir("out/cjs"),
          format: "cjs",
          ...outputOptions,
        },
        {
          dir: dir("out/esm"),
          format: "esm",
          ...outputOptions,
        },
      ],
      plugins: [
        typescript2({
          check: true,
          clean: true,
          tsconfig: dir("tsconfig.json"),
        }),
      ],
      external: id => !/^[./]/.test(id), // don't package any node_modules
    })
  })
}
