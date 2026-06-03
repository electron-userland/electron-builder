import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    indexInternal: "src/indexInternal.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  tsconfig: "../tsconfig-tsup.json",
  sourcemap: true,
  clean: true,
  outDir: "dist",
  platform: "node",
  shims: true,
})
