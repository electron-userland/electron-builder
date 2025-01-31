import commonjs from "@rollup/plugin-commonjs"
import typescript from "@rollup/plugin-typescript"
import { defineConfig } from "rollup"
import { cleandir } from "rollup-plugin-cleandir"
import dts from "rollup-plugin-dts"
import generateDeclarations from "rollup-plugin-generate-declarations"
import { nodeResolve } from "@rollup/plugin-node-resolve"
import json from "@rollup/plugin-json"
import * as glob from "glob"

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
    package: "electron-updater",
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
    package: "electron-forge-maker-nsis",
    entry: "main.js",
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

export default () => {
  const outDir = "out"
  return packageMap.map(pkg =>
    defineConfig({
      input: glob.sync(`packages/${pkg.package}/${pkg.entry}`, { ignore: [outDir, "**/*/*.d.ts"] }),
      treeshake: false,
      output: {
        dir: `packages/${pkg.package}/${outDir}`,
        format: "cjs",
        sourcemap: true,
        preserveModules: true, // Keep files separates instead of one bundled file
      },
      plugins: [
        cleandir(outDir),
        commonjs({ extensions: [".js", ".ts"] }),
        // dts({
        //   tsconfig: "./tsconfig.json",
        // }),
        // nodeResolve(),
        json(),
        typescript({
          tsconfig: `packages/${pkg.package}/tsconfig.json`,
          checkJs: true,
          declaration: true,
          declarationDir: `packages/${pkg.package}/${outDir}`,
          sourceMap: true,
          // useTsconfigDeclarationDir: true,
          // verbosity: 3,
          // clean: true,
        }),
        // generateDeclarations(),
      ],
    })
  )
}
