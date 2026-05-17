import { registerDifferentialLinuxTests } from "../differentialUpdateLinuxSuite"

describe.ifLinux("AppImage", { sequential: true }, () => {
  registerDifferentialLinuxTests("1.0.3")
})
