import path from "path"
import { nodeExternals } from "rollup-plugin-node-externals"
import { defineConfig } from "vite"
import packageJson from "./package.json"

export default defineConfig({
  build: {
    target: "node",
    lib: {
      entry: path.resolve(__dirname, "src/dmgUtil.ts"),
      name: packageJson.name,
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      plugins: [nodeExternals()],
    },
  },
})
