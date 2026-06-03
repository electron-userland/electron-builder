import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    indexInternal: "src/indexInternal.ts",
    "cli/cli": "src/cli/cli.ts",
    "cli/install-app-deps": "src/cli/install-app-deps.ts",
  },
  format: ["cjs", "esm"],
  dts: {
    entry: {
      index: "src/index.ts",
      indexInternal: "src/indexInternal.ts",
    },
  },
  tsconfig: "../tsconfig-tsup.json",
  sourcemap: true,
  clean: true,
  outDir: "dist",
  platform: "node",
  shims: true,
})
