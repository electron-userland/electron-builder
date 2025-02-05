import { glob } from "glob"
import { defineConfig } from "rollup"
import { cleandir } from "rollup-plugin-cleandir"
import typescript from "rollup-plugin-typescript2"

export default () => {
  const outDir = "out"
  const dir = outDir
  const input = glob.sync("src/**/*.ts", { ignore: [dir, "**/*/*.d.ts"] })
  return defineConfig({
    input,
    treeshake: false,
    output: {
      dir: dir,
      format: "cjs",
      sourcemap: true,
      preserveModules: true, // Keep files separates instead of one bundled file
    },
    external: id => !/^[./]/.test(id), // don't package any node_modules
    watch: {
      exclude: [dir],
    },
    plugins: [
      cleandir(dir),
      typescript({
        tsconfig: `tsconfig.json`,
        clean: true,
        check: true,
      }),
    ],
  })
}
