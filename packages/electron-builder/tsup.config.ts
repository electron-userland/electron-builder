import { defineConfig } from "tsup"
import { baseConfig } from "../../tsup.config.base"

export default defineConfig({
  ...baseConfig,
  entry: {
    index: "src/index.ts",
    indexInternal: "src/indexInternal.ts",
    "cli/cli": "src/cli/cli.ts",
    "cli/install-app-deps": "src/cli/install-app-deps.ts",
  },
  dts: {
    entry: {
      index: "src/index.ts",
      indexInternal: "src/indexInternal.ts",
    },
  },
  shims: true,
})
