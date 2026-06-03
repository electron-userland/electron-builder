import type { Options } from "tsup"

export const baseConfig: Options = {
  format: ["cjs", "esm"],
  dts: true,
  tsconfig: "../tsconfig-tsup.json",
  sourcemap: true,
  clean: true,
  outDir: "dist",
  platform: "node",
}
