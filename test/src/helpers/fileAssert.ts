import { stat, Stats, access } from "fs-extra-p"
import * as json8 from "json8"
import { green, red, gray } from "chalk"
import { diffJson } from "diff"
import { AssertionError } from "assert"
import * as path from "path"

// http://joel-costigliola.github.io/assertj/
export function assertThat(actual: any): Assertions {
  return new Assertions(actual)
}

//noinspection JSUnusedLocalSymbols
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
    compare(this.actual, expected)
  }

  isNotEmpty() {
    compare(this.actual, "", true)
  }

  containsAll<T>(expected: Iterable<T>) {
    compare(this.actual.slice().sort(), Array.from(expected).slice().sort())
  }

  hasProperties(expected: any) {
    const actual = Object.create(null)
    for (let name of Object.getOwnPropertyNames(this.actual)) {
      if (name in expected) {
        actual[name] = this.actual[name]
      }
    }
    compare(actual, expected)
  }

  isAbsolute() {
    if (!path.isAbsolute(this.actual)) {
      throw new Error(`Path ${this.actual} is not absolute`)
    }
  }

  async isFile() {
    const info: Stats = await stat(this.actual)
    if (!info.isFile()) {
      throw new Error(`Path ${this.actual} is not a file`)
    }
  }

  async isDirectory() {
    const info: Stats = await stat(this.actual)
    if (!info.isDirectory()) {
      throw new Error(`Path ${this.actual} is not a directory`)
    }
  }

  async doesNotExist() {
    try {
      await access(this.actual)
    }
    catch (e) {
      return
    }

    throw new Error(`Path ${this.actual} must not exist`)
  }

  async throws(error: string | RegExp) {
    let actualError: Error | null
    let result: any
    try {
      result = await this.actual
    }
    catch (e) {
      actualError = e
    }

    expect(() => {
      if (actualError == null) {
        return result
      }
      else {
        throw actualError
      }
    }).toThrowError(error)
  }
}

export function prettyDiff(actual: any, expected: any): string {
  const diffJson2 = diffJson(expected, actual)
  const diff = diffJson2.map(part => {
    if (part.added) {
      return green(part.value.replace(/.+/g, "    - $&"))
    }
    if (part.removed) {
      return red(part.value.replace(/.+/g, "    + $&"))
    }
    return gray(part.value.replace(/.+/g, "    | $&"))
  }).join("")
  return `\n${diff}\n`
}

function compare(actual: any, expected: any, not: boolean = false) {
  if (json8.equal(actual, expected) === not) {
    const actualJson = JSON.stringify(actual, jsonReplacer, 2)
    const expectedJson = JSON.stringify(expected, jsonReplacer, 2)
    const stack = new Error().stack
    throw new AssertionError({
      message: `Expected \n${expectedJson}\n\nis not equal to\n\n${actualJson}\n\n${prettyDiff(JSON.parse(expectedJson), JSON.parse(actualJson))}\n${stack.split("\n")[3].trim()}`,
      actual: actual,
      expected: expected,
    })
  }
}