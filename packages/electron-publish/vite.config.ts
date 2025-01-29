import path from "path"
import { defineConfig } from "vite"
import packageJson from "./package.json"
import { nodeExternals } from "rollup-plugin-node-externals"

export default defineConfig({
  build: {
    target: "node",
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: packageJson.name,
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      plugins: [nodeExternals()],
    },
  },
})
