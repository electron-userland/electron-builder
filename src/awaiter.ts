import { Promise as BluebirdPromise } from "bluebird"

export function tsAwaiter(thisArg: any, _arguments: any, ignored: any, generator: Function) {
  return BluebirdPromise.coroutine(generator).call(thisArg, _arguments)
}
