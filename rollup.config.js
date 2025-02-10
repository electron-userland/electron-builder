import typescript from "@rollup/plugin-typescript"
import typescript2 from "rollup-plugin-typescript2"
import { defineConfig } from "rollup"
import * as glob from "glob"
import typescriptCompiler from "typescript"
// import { cleandir } from "rollup-plugin-cleandir"
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

// export default () => {
//   const outDir = "out"
// return packageMap.map(pkg => {
//   const dir = path.resolve(process.cwd(), `packages/${pkg.package}/${outDir}`)
//   const input = glob.sync(`packages/${pkg.package}/${pkg.entry}`, { ignore: [dir, "**/*/*.d.ts"] })
//   return defineConfig({
//     input,
//     treeshake: false,
//     output: {
//       dir: dir,
//       format: "cjs",
//       sourcemap: true,
//       preserveModules: true, // Keep files separates instead of one bundled file
//     },
//     watch: {
//       exclude: [dir],
//     },
//     plugins: [
//       cleandir(dir),
//       typescript({
//         tsconfig: `packages/${pkg.package}/tsconfig.json`,
//         clean: true,
//         check: true,
//       }),
//     ],
//   })
// })
// }

const additionalWatchFiles = glob.sync(["**/tsconfig.json", "**/package.json"], { ignore: ["node_modules", "docker-node-modules"] })
const typeRoots = glob.sync(["./node_modules/@types", "packages/*/node_modules/@types", "**/typings"])
const files = packageMap
  .map(pkg => {
    const input = glob.sync(
      `packages/${pkg.package}/${pkg.entry}`,
      //
      { ignore: ["**/*.d.ts"] }
    )
    return input
  })
  .flat()

const input = files.reduce((acc, curr) => {
  const out = curr.replace(`${path.sep}src${path.sep}`, `${path.sep}out${path.sep}`).replace(".ts", "")
  return {
    ...acc,
    [out]: curr,
  }
}, {})

const rootDirs = packageMap.map(pkg => {
  return `packages/${pkg.package}/src`
})

export default () => {
  console.log(typeRoots)
  return defineConfig({
    input,
    treeshake: false,
    output: {
      // dir: dir,
      dir: 'out',
      format: "cjs",
      sourcemap: true,
      preserveModules: true, // Keep files separates instead of one bundled file
    },
    // watch: {
    //   // exclude: [dir],
    //   include: [
    //     "./tsconfig.json",
    //     "**/tsconfig.json",
    //     //
    //     "./package.json",
    //     "**/package.json",
    //   ],
    // },
    external: id => !/^[./]/.test(id),
    // external(source, importer, isResolved) {
    //   // console.log({ source, isResolved, importer })
    //   return !/^[./]/.test(source) // || source.includes("/src/")
    // },
    plugins: [
      {
        name: "watch-external",
        buildStart() {
          additionalWatchFiles.forEach(file => {
            this.addWatchFile(file)
          })
        },
      },
      // cleandir(dir),
      // typescript({
      //   // tsconfig: `./tsconfig.json`,
      //   compilerOptions: {
      //     typeRoots,
      //     rootDirs,
      //     target: "esnext",
      //     module: "esnext",
      //     esModuleInterop: true,
      //     // esModuleInterop: false,
      //     forceConsistentCasingInFileNames: true,
      //     moduleResolution: "node",
      //     skipLibCheck: true,
      //     strict: true,

      //     allowSyntheticDefaultImports: true,
      //     experimentalDecorators: true,
      //     noEmitOnError: true,
      //     declaration: false
      //   },
      // }),
      typescript2({
        tsconfig: `tsconfig.json`,
        clean: true,
        check: true,
        abortOnError: true,
        tsconfigOverride: {
          compilerOptions: {
            // types: ["node", "@malept/flatpak-bundler"],
            typeRoots,
            rootDirs,
            target: "ES2024",
            module: "ES2022",
            esModuleInterop: false,
            // forceConsistentCasingInFileNames: true,
            moduleResolution: "node",
            skipLibCheck: true,
            strict: true,
            noUnusedLocals: false,
            noFallthroughCasesInSwitch: true,
            noImplicitReturns: true,

            inlineSources: true,
            sourceMap: true,

            allowSyntheticDefaultImports: true,
            experimentalDecorators: true,

            newLine: "lf",

            noEmitOnError: true,
          },
        },
      }),
    ],
  })
}
