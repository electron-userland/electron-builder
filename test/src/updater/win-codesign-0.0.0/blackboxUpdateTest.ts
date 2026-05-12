import { registerBlackboxWinTests } from "../blackboxUpdateWinSuite"

const optionsForFlakyE2E = { sequential: true, retry: 2 }

describe(`winCodeSign: 0.0.0`, optionsForFlakyE2E, () => {
  registerBlackboxWinTests("0.0.0")
})
