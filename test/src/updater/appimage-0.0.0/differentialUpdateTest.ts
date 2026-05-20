import { registerDifferentialLinuxTests } from "../differentialUpdateLinuxSuite"

describe.ifLinux("AppImage", { sequential: true }, () => {
  registerDifferentialLinuxTests("0.0.0")
})
