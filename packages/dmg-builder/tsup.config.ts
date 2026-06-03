import { defineConfig } from "tsup"
import { baseConfig } from "../../tsup.config.base"

export default defineConfig({
  ...baseConfig,
  entry: {
    dmgUtil: "src/dmgUtil.ts",
  },
})
