import type { Options } from "tsup"

export const baseConfig: Options = {
  format: ["cjs", "esm"],
  dts: true,
  tsconfig: "../tsconfig-tsup.json",
  sourcemap: true,
  clean: !process.argv.includes("--watch"),
  outDir: "dist",
  platform: "node",
}
