import { executeAppBuilder } from "builder-util"

export function executeAppBuilderAsJson<T>(args: Array<string>): Promise<T> {
  return executeAppBuilder(args).then(rawResult => {
    if (rawResult === "") {
      return Object.create(null) as T
    }

    try {
      return JSON.parse(rawResult) as T
    } catch (e: any) {
      throw new Error(`Cannot parse result: ${e.message}: "${rawResult}"`)
    }
  })
}

export function objectToArgs(to: Array<string>, argNameToValue: Record<string, string | null>): void {
  for (const name of Object.keys(argNameToValue)) {
    const value = argNameToValue[name]
    if (value != null) {
      to.push(`--${name}`, value)
    }
  }
}
