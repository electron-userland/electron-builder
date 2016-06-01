import { stat } from "fs-extra-p"
import * as json8 from "json8"
import { green, red, gray } from "chalk"
import { diffJson } from "diff"
import { AssertionError } from "assert"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

// http://joel-costigliola.github.io/assertj/
export function assertThat(actual: any): Assertions {
  return new Assertions(actual)
}

function jsonReplacer(key: any, value: any): any {
  if (value instanceof Map) {
    return [...value]
  }
  return value === undefined ? undefined : value
}

class Assertions {
  constructor (private actual: any) {
  }

  isEqualTo(expected: any) {
    if (!json8.equal(this.actual, expected)) {
      throw new AssertionError({
        message: prettyDiff(JSON.parse(JSON.stringify(this.actual, jsonReplacer)), JSON.parse(JSON.stringify(expected, jsonReplacer)))
      })
    }
  }

  async isFile() {
    const info = await stat(this.actual)
    if (!info.isFile()) {
      throw new Error(`Path ${this.actual} is not a file`)
    }
  }

  async isDirectory() {
    const info = await stat(this.actual)
    if (!info.isDirectory()) {
      throw new Error(`Path ${this.actual} is not a directory`)
    }
  }

  async doesNotExist() {
    try {
      await stat(this.actual)
    }
    catch (e) {
      return
    }

    throw new Error(`Path ${this.actual} must not exist`)
  }
}

function prettyDiff(actual: any, expected: any): string {
  const diffJson2 = diffJson(expected, actual)
  const diff = diffJson2.map(part => {
    if (part.added) return green(part.value.replace(/.+/g, '    - $&'))
    if (part.removed) return red(part.value.replace(/.+/g, '    + $&'))
    return gray(part.value.replace(/.+/g, '    | $&'))
  }).join('')
  return `\n${diff}\n`
}