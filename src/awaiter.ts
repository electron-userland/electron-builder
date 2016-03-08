import { Promise as BluebirdPromise } from "bluebird"
import "source-map-support/register"

BluebirdPromise.config({
  longStackTraces: true,
  cancellation: true
})

export = function tsAwaiter(thisArg: any, _arguments: any, ignored: any, generator: Function) {
  return BluebirdPromise.coroutine(generator).call(thisArg, _arguments)
}
