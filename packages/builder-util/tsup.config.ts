import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    util: "src/util.ts",
    indexInternal: "src/indexInternal.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  tsconfig: "../tsconfig-tsup.json",
  sourcemap: true,
  clean: true,
  outDir: "dist",
  platform: "node",
})
