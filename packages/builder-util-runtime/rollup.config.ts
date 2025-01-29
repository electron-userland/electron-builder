import commonjs from "@rollup/plugin-commonjs"
import typescript from "@rollup/plugin-typescript"
import { defineConfig } from "rollup"

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "./out",
    format: "cjs",
  },
  plugins: [commonjs({ extensions: [".js", ".ts"] }), typescript({ tsconfig: "./tsconfig.json" })],
})
