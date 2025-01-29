import commonjs from "@rollup/plugin-commonjs"
import typescript from "@rollup/plugin-typescript"

export default {
  input: "src/dmgUtil.ts",
  output: {
    dir: "./out",
    format: "cjs",
  },
  plugins: [commonjs({ extensions: [".js", ".ts"] }), typescript({ tsconfig: "./tsconfig.json" })],
}
