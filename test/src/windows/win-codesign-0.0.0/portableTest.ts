import { ToolsetConfig } from "app-builder-lib"
import { registerPortableTests } from "../portableTestSuite"

const winCodeSign: ToolsetConfig["winCodeSign"] = "0.0.0"

describe.ifWindows("portable", () => {
  describe(`winCodeSign: ${winCodeSign}`, () => {
    registerPortableTests({ winCodeSign })
  })
})
