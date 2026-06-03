import { defineConfig } from "tsup"
import { baseConfig } from "../../tsup.config.base"

export default defineConfig({
  ...baseConfig,
  entry: {
    util: "src/util.ts",
    indexInternal: "src/indexInternal.ts",
  },
})
