import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    dmgUtil: "src/dmgUtil.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  tsconfig: "../tsconfig-tsup.json",
  sourcemap: true,
  clean: true,
  outDir: "dist",
  platform: "node",
})
