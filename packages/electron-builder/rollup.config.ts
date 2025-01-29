import typescript from "@rollup/plugin-typescript"
import commonjs from "@rollup/plugin-commonjs"

export default {
  input: "src/index.ts",
  output: {
    dir: "./out",
    format: "cjs",
  },
  plugins: [commonjs({ extensions: [".js", ".ts"] }), typescript({ tsconfig: "./tsconfig.json" })],
}
