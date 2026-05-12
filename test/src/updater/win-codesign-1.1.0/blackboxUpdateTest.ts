import { registerBlackboxWinTests } from "../blackboxUpdateWinSuite"

const optionsForFlakyE2E = { sequential: true, retry: 2 }

describe(`winCodeSign: 1.1.0`, optionsForFlakyE2E, () => {
  registerBlackboxWinTests("1.1.0")
})
