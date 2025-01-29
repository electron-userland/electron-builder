import typescript from "@rollup/plugin-typescript"
import path from "path"
import { nodeExternals } from "rollup-plugin-node-externals"
import { defineConfig } from "vite"
import packageJson from "./package.json"

export default defineConfig({
  build: {
    target: "node",
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: packageJson.name,
      formats: ["cjs"],
    },
    rollupOptions: {
      plugins: [nodeExternals(), typescript({ tsconfig: "./tsconfig.json" })],
    },
  },
})
