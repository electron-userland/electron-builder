import { registerDifferentialWinTests } from "../differentialUpdateWinSuite"

describe.ifWindows("winCodeSign: 1.1.0", { sequential: true }, () => {
  registerDifferentialWinTests("1.1.0")
})
