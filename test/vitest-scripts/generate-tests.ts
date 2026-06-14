#!/usr/bin/env tsx
import { existsSync, rmSync } from "fs-extra"
import { generateLinuxToolsetTests } from "./runtime-tests/generate-toolset-tests-linux"
import { generateMacToolsetTests } from "./runtime-tests/generate-toolset-tests-mac"
import { GENERATED_TESTS_DIR } from "./runtime-tests/generate-toolset-tests-shared"
import { generateWindowsToolsetTests } from "./runtime-tests/generate-toolset-tests-windows"

const generateTests = () => {
  if (existsSync(GENERATED_TESTS_DIR)) {
    // Clear out old generated tests before generating new ones
    rmSync(GENERATED_TESTS_DIR, { recursive: true })
  }
  generateLinuxToolsetTests()
  generateMacToolsetTests()
  generateWindowsToolsetTests()
}

if (require.main === module) {
  generateTests()
}

export { generateTests }
