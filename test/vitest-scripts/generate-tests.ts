#!/usr/bin/env tsx
import { existsSync, rmSync } from "fs-extra"
import { generateLinuxToolsetTests } from "./generate-toolset-tests-linux"
import { GENERATED_TESTS_DIR } from "./generate-toolset-tests-shared"
import { generateWindowsToolsetTests } from "./generate-toolset-tests-windows"

const generateTests = () => {
  if (existsSync(GENERATED_TESTS_DIR)) {
    // Clear out old generated tests before generating new ones
    rmSync(GENERATED_TESTS_DIR, { recursive: true })
  }
  generateLinuxToolsetTests()
  generateWindowsToolsetTests()
}

if (require.main === module) {
  generateTests()
}

export { generateTests }
