import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    SquirrelWindowsTarget: "src/SquirrelWindowsTarget.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  tsconfig: "../tsconfig-tsup.json",
  sourcemap: true,
  clean: true,
  outDir: "dist",
  platform: "node",
})
