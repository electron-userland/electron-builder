import { stat } from "fs-extra-p"
import { AssertionError } from "assert"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

export function assertThat(path: string) {
  return new FileAssertions(path)
}

class FileAssertions {
  constructor (private path: string) {
  }

  async isFile() {
    const info = await stat(this.path)
    if (!info.isFile()) {
      throw new Error(`Path ${this.path} is not a file`)
    }
  }

  async isDirectory() {
    const info = await stat(this.path)
    if (!info.isDirectory()) {
      throw new Error(`Path ${this.path} is not a file`)
    }
  }

  async doesNotExist() {
    try {
      await stat(this.path)
    }
    catch (e) {
      return
    }

    throw new Error(`Path ${this.path} must not exist`)
  }
}