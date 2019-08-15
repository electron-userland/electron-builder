import { outputFile } from "fs-extra"
import { serializeToYaml } from "./util"

export class DebugLogger {
  readonly data: any = {}

  constructor(readonly isEnabled = true) {
  }

  add(key: string, value: any) {
    if (!this.isEnabled) {
      return
    }

    const dataPath = key.split(".")
    let o = this.data
    let lastName: string | null = null
    for (const p of dataPath) {
      if (p === dataPath[dataPath.length - 1]) {
        lastName = p
        break
      }
      else {
        if (o[p] == null) {
          o[p] = Object.create(null)
        }
        else if (typeof o[p] === "string") {
          o[p] = [o[p]]
        }
        o = o[p]
      }
    }

    if (Array.isArray(o[lastName!!])) {
      o[lastName!!].push(value)
    }
    else {
      o[lastName!!] = value
    }
  }

  save(file: string) {
    // toml and json doesn't correctly output multiline string as multiline
    if (this.isEnabled && Object.keys(this.data).length > 0) {
      return outputFile(file, serializeToYaml(this.data))
    }
    else {
      return Promise.resolve()
    }
  }
}