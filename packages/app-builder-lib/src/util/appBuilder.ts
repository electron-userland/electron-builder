import { executeAppBuilder } from "builder-util"

export function executeAppBuilderAsJson<T>(args: Array<string>): Promise<T> {
  return executeAppBuilder(args)
    .then(rawResult => {
      try {
        return JSON.parse(rawResult) as T
      }
      catch (e) {
        throw new Error(`Cannot parse result: ${e.message}: "${rawResult}"`)
      }
    })
}