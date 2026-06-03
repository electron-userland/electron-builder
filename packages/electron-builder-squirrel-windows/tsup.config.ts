import { defineConfig } from "tsup"
import { baseConfig } from "../../tsup.config.base"

export default defineConfig({
  ...baseConfig,
  entry: {
    SquirrelWindowsTarget: "src/SquirrelWindowsTarget.ts",
  },
})
