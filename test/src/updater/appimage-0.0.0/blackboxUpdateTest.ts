import { registerBlackboxLinuxTests } from "../blackboxUpdateLinuxSuite"

const optionsForFlakyE2E = { sequential: true, retry: 2 }

describe.heavy.ifLinux("linux", optionsForFlakyE2E, () => {
  registerBlackboxLinuxTests("0.0.0")
})
