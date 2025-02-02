import typescript from "@rollup/plugin-typescript"
import typescript2 from "rollup-plugin-typescript2"
import * as fs from "fs"
import * as glob from "glob"
import { defineConfig } from "rollup"
import { cleandir } from "rollup-plugin-cleandir"

const packageMap = [
  {
    package: "builder-util-runtime",
    entry: "src/**/*.ts",
  },
  // {
  //   package: "builder-util",
  //   entry: "src/**/*.ts",
  // },
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
    const input = glob.sync(dir(pkg.entry), { ignore: [dir(outDir), "**/*/*.d.ts"] })
    // const tsconfigJson = JSON.parse(fs.readFileSync(dir("tsconfig.json"), "utf-8"))
    return defineConfig({
      input, //: dir(!pkg.package.includes("forge") ? input.replace(".js", ".ts") : input),
      treeshake: false,
      output: [
        {
          dir: dir("out/cjs"),
          format: "cjs",
          // exports: "named",
          preserveModules: true,
          sourcemap: true,
          // interop: "auto",
        },
        {
          dir: dir("out/esm"),
          format: "esm",
          // exports: "named",
          preserveModules: true,
          sourcemap: true,
          // interop: "auto",
        },
      ],
      plugins: [
        // cleandir(dir(outDir)),
        // typescript({
        //   tsconfig: dir("tsconfig.json"),
        //   checkJs: true,
        //   // declaration: false,
        //   // declarationDir: path.join(dir(""), "types"),
        //   // outDir: dir(outDir),
        //   sourceMap: true,
        //   // compilerOptions: {
        //   //   outDir: dir(outDir),
        //   // },
        // }),
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
