import typescript from "@rollup/plugin-typescript"
import { defineConfig } from "rollup"
import * as glob from "glob"
import { createRequire } from "node:module"
import path from "node:path"
import * as fs from "fs"

const packageMap = [
  {
    package: "builder-util-runtime",
    entry: "src/**/*.ts",
  },
  {
    package: "builder-util",
    entry: "src/**/*.ts",
  },
  // {
  //   package: "electron-publish",
  //   entry: "src/**/*.ts",
  // },
  // {
  //   package: "app-builder-lib",
  //   entry: "src/**/*.ts",
  // },
  // {
  //   package: "dmg-builder",
  //   entry: "src/**/*.ts",
  // },
  // {
  //   package: "electron-updater",
  //   entry: "src/**/*.ts",
  // },
  // {
  //   package: "electron-builder",
  //   entry: "src/**/*.ts",
  // },
  // {
  //   package: "electron-builder-squirrel-windows",
  //   entry: "src/**/*.ts",
  // },
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

const outputOptions = {
  exports: "named",
  preserveModules: true,
  // Ensures that CJS default exports are imported properly (based on __esModule)
  // If needed, can switch to 'compat' which checks for .default prop on the default export instead
  // see https://rollupjs.org/configuration-options/#output-interop
  interop: "auto",
}

export default () => {
  const outDir = "out"
  return packageMap.map(pkg => {
    const dir = p => `packages/${pkg.package}/${p}`
    const input = glob.sync(`packages/${pkg.package}/${pkg.entry}`, { ignore: [dir(outDir), "**/*/*.d.ts"] })

    const packageJson = JSON.parse(fs.readFileSync(dir("package.json"), "utf-8"))
    // const input = filesGlob.reduce((prev, curr) => {

    // })
    // const input = packageJson.main.replace("out/", "src/")
    return defineConfig({
      input, //: dir(!pkg.package.includes("forge") ? input.replace(".js", ".ts") : input),
      treeshake: false,
      output: [
        // { file: packageJson.main, format: "cjs", sourcemap: true },
        // { file: packageJson.module, format: "es", sourcemap: true },
        // {
        //   dir: dir("esm"),
        //   format: "esm",
        //   exports: "named",
        //   preserveModules: true,
        //   // Ensures that CJS default exports are imported properly (based on __esModule)
        //   // If needed, can switch to 'compat' which checks for .default prop on the default export instead
        //   // see https://rollupjs.org/configuration-options/#output-interop
        //   interop: "auto",
        // },
        {
          dir: dir(outDir),
          format: "cjs",
          exports: "named",
          preserveModules: true,
          interop: "auto",
        },
      ],
      plugins: [
        typescript({
          tsconfig: `packages/${pkg.package}/tsconfig.json`,
          checkJs: true,
          // declaration: false,
          // declarationDir: path.join(dir(""), "types"),
          outDir: dir(outDir),
          sourceMap: true,
          // compilerOptions: {
          //   outDir: dir(outDir),
          // },
        }),
      ],
      external: id => !/^[./]/.test(id), // don't package any node_modules
    })
  })
}
