import { registerDifferentialWinTests } from "../differentialUpdateWinSuite"

describe.ifWindows("winCodeSign: 0.0.0", { sequential: true }, () => {
  registerDifferentialWinTests("0.0.0")
})
