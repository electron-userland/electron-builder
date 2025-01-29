import commonjs from "@rollup/plugin-commonjs"
import typescript from "@rollup/plugin-typescript"
import { defineConfig } from "rollup"

export default defineConfig({
  input: "src/main.ts",
  output: {
    dir: "./out",
    format: "cjs",
    sourcemap: true,
  },
  plugins: [commonjs({ extensions: [".js", ".ts"] }), typescript({ tsconfig: "./tsconfig.json" })],
})
