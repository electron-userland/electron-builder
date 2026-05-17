import { registerDifferentialWinTests } from "../differentialUpdateWinSuite"

describe.ifWindows("winCodeSign: 1.0.0", { sequential: true }, () => {
  registerDifferentialWinTests("1.0.0")
})
