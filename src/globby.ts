import { Promise as BluebirdPromise } from "bluebird"
import { Glob, Options } from "glob"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

function isNegative(pattern: string): boolean {
  return pattern[0] === "!"
}

function generateGlobTasks(patterns: Array<string>, opts: Options): Array<any> {
  opts = Object.assign({ignore: []}, opts)

  const globTasks: Array<any> = []
  patterns.forEach(function (pattern, i) {
    if (isNegative(pattern)) {
      return
    }

    const ignore = patterns.slice(i).filter(isNegative).map(it => it.slice(1))
    globTasks.push({
      pattern: pattern,
      opts: Object.assign({}, opts, {
        ignore: (<Array<string>>opts.ignore).concat(ignore)
      })
    })
  })
  return globTasks
}

export function globby(patterns: Array<string>, opts: Options): Promise<Set<string>> {
  let firstGlob: Glob | null = null
  return BluebirdPromise
    .map(generateGlobTasks(patterns, opts), task => new BluebirdPromise((resolve, reject) => {
      let glob = new Glob(task.pattern, task.opts, (error, matches) => {
        if (error == null) {
          resolve(matches)
        }
        else {
          reject(error)
        }
      })

      if (firstGlob == null) {
        firstGlob = glob
      }
      else {
        glob.statCache = firstGlob.statCache
        glob.symlinks = firstGlob.symlinks
        glob.realpathCache = firstGlob.realpathCache
        glob.cache = firstGlob.cache
      }
    }))
    .then(it => new Set([].concat(...it)))
}