#!/usr/bin/env ts-node
import { generateLinuxToolsetTests } from "./generate-toolset-tests-linux"
import { generateWindowsToolsetTests } from "./generate-toolset-tests-windows"

const generateTests = () => {
  generateLinuxToolsetTests()
  generateWindowsToolsetTests()
}

if (require.main === module) {
  generateTests()
}

export { generateTests }