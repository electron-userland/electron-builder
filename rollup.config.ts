import typescript from "@rollup/plugin-typescript"
import typescript2 from "rollup-plugin-typescript2"
import { defineConfig } from "rollup"
import * as glob from "glob"
import { cleandir } from "rollup-plugin-cleandir"
import typescriptCompiler from "typescript"
import commonjs from "@rollup/plugin-commonjs"

// import { cleandir } from "rollup-plugin-cleandir"
import path from "path"

const packageMap = [
  {
    package: "builder-util-runtime",
    entry: "src/**/*.ts",
    main: "src/index.ts",
  },
  {
    package: "builder-util",
    entry: "src/**/*.ts",
    main: "src/index.ts",
  },
  {
    package: "electron-publish",
    entry: "src/**/*.ts",
    main: "src/index.ts",
  },
  {
    package: "app-builder-lib",
    entry: "src/**/*.ts",
    main: "src/index.ts",
  },
  {
    package: "dmg-builder",
    entry: "src/**/*.ts",
    main: "src/index.ts",
  },
  {
    package: "electron-updater",
    entry: "src/**/*.ts",
    main: "src/index.ts",
  },
  {
    package: "electron-builder",
    entry: "src/**/*.ts",
    main: "src/index.ts",
  },
  {
    package: "electron-builder-squirrel-windows",
    entry: "src/**/*.ts",
    main: "src/index.ts",
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
      // include: rootDirs,
      // exclude: [dir, "packages/*/out"],
    },
    external: id => !/^[./]/.test(id),
    plugins: [
            {
        name: "watch-external",
        buildStart() {
          additionalWatchFiles.forEach(file => {
            this.addWatchFile(file)
          })
        },
      },
      cleandir(dir),
      typescript2({
        tsconfig: `packages/${pkg.package}/tsconfig.json`,
        clean: true,
        check: true,
        abortOnError: true,
        tsconfigOverride: {
          compilerOptions: {
            typeRoots,
          //   rootDirs,
          },
          // references: packageMap.map(pkg => ({
          //   path: `../${pkg.package}`,
          // })),
        },
      }),
    ],
  })
})
}

const additionalWatchFiles = glob.sync(["**/tsconfig.json", "**/package.json", "**/*.d.ts"], { ignore: ["node_modules", "docker-node-modules"] })
const typeRoots = glob.sync(["./node_modules/@types", "packages/*/node_modules/@types", "**/typings"])
const globPath = (pkg: any) => `packages/${pkg.package}/${pkg.entry}`
const files = packageMap
  .map(pkg => {
    const input = glob.sync(
      globPath(pkg),
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

// export default () => {
//   console.log(typeRoots)
//   return defineConfig({
//     input,
//     treeshake: false,
//     output: {
//       // dir: dir,
//       dir: "out",
//       format: "cjs",
//       sourcemap: true,
//       preserveModules: true, // Keep files separates instead of one bundled file
//     },
//     // watch: {
//     //   // exclude: [dir],
//     //   include: [
//     //     "./tsconfig.json",
//     //     "**/tsconfig.json",
//     //     //
//     //     "./package.json",
//     //     "**/package.json",
//     //   ],
//     // },
//     // external: id => !/^[./]/.test(id), // || packageMap.findIndex(pkg => id.includes(pkg.package)) === -1,
//     // external(source, importer, isResolved) {
//     //   // console.log({ source, isResolved, importer })
//     //   return !/^[./]/.test(source) // || source.includes("/src/")
//     // },
//     plugins: [
//       {
//         name: "watch-external",
//         buildStart() {
//           additionalWatchFiles.forEach(file => {
//             this.addWatchFile(file)
//           })
//         },
//       },
//       // cleandir(dir),
//       // commonjs(),
//       // typescript({
//       //   tsconfig: `./tsconfig.json`,
//       //   include: packageMap.map(pkg => globPath(pkg)),
//       //   compilerOptions: {
//       //     typeRoots,
//       //     rootDirs,
//       //     // target: "esnext",
//       //     // module: "esnext",
//       //     // esModuleInterop: true,
//       //     // // esModuleInterop: false,
//       //     // forceConsistentCasingInFileNames: true,
//       //     // moduleResolution: "node",
//       //     // skipLibCheck: true,
//       //     // strict: true,

//       //     // allowSyntheticDefaultImports: true,
//       //     // experimentalDecorators: true,
//       //     // noEmitOnError: true,
//       //     // declaration: false
//       //   },
//       // }),
//       // commonjs({
//       //   // exclude: /^[./]/,
//       // }),
//       typescript2({
//         tsconfig: `./tsconfig.json`,
//         include: packageMap.map(pkg => globPath(pkg)),
//         exclude: ['rollup.config.ts'],
//         clean: true,
//         check: true,
//         abortOnError: true,
//         tsconfigOverride: {
//           compilerOptions: {
//             typeRoots,
//             rootDirs,
//           },
//           references: packageMap.map(pkg => ({
//             path: `../${pkg.package}`,
//           })),
//         },
//       }),
//       // commonjs({
//       //   // exclude: /^[./]/,
//       // }),
//     ],
//   })
// }
