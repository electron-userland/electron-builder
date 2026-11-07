import { log } from "builder-util"
import type { Dirent, Stats } from "fs"
import { lstat, readdir, readFile } from "fs/promises"
import * as path from "path"
import * as semver from "semver"
import { Node, readAsar } from "../asar/asar.js"
import type { Packager } from "../packager.js"
import { CROSS_ORIGIN_HEADERS_MIN_UPDATER_RELEASE } from "../util/electronUpdaterCompatibility.js"
import { findAppElectronUpdater } from "../util/packageMetadata.js"

/** Larger files are not scanned: app code is far smaller, so these are data or assets that happen to end in `.js`. */
const MAX_SCANNED_FILE_SIZE = 20 * 1024 * 1024
const SCANNED_EXTENSIONS = new Set([".js", ".mjs", ".cjs"])

/**
 * An assignment of a value to the property, also a minified one (`e.crossOriginHeaders=()=>[]`) or a logical assignment (`??=`),
 * but not of `null`, `undefined` or `void 0` - the compiled class field of electron-updater itself (`this.crossOriginHeaders = null`),
 * which a bundler inlines into the app code - and not a comparison (`==`, `===`).
 */
const CROSS_ORIGIN_HEADERS_ASSIGNMENT = /\.crossOriginHeaders\s*(?:\?\?|\|\||&&)?=(?!=)(?!\s*(?:null|undefined|void)\b)/

/** Words after which a `/` starts a regular expression literal rather than a division. */
const KEYWORDS_BEFORE_EXPRESSION = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"])

const IDENTIFIER = /[\p{ID_Continue}$]+/uy

/**
 * electron-updater rejects every update check and download of an installed app until the app sets `autoUpdater.crossOriginHeaders`
 * (`ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED`), which a developer who never runs the updater before a release does not see. The
 * updater cannot recover an app shipped that way, so the build warns when the app's own JavaScript in the packed app (app.asar, its
 * unpacked files, or the app directory; not `node_modules`) has no assignment to the property. Only for an app that ships an
 * electron-updater that may require it (see {@link CROSS_ORIGIN_HEADERS_MIN_UPDATER_RELEASE}). A heuristic: an assignment it cannot
 * see (bracket notation, `Object.assign`, code in `node_modules` or bytecode) makes it warn, one in code that never runs keeps it quiet.
 * It never fails the build.
 *
 * @internal exported for tests
 */
export async function warnIfNoCrossOriginHeadersAssignment(packager: Pick<Packager, "metadata" | "devMetadata" | "projectDir">, resourcesDir: string): Promise<void> {
  const updater = findAppElectronUpdater(packager.metadata, packager.devMetadata, packager.projectDir)
  if (updater == null) {
    return
  }
  // an installed version or a declared range; one that cannot be read (`catalog:`, a dist-tag) may require it
  const range = updater.isUnresolvable ? null : semver.validRange(updater.version, { includePrerelease: true })
  if (range != null && semver.gtr(CROSS_ORIGIN_HEADERS_MIN_UPDATER_RELEASE, range, { includePrerelease: true })) {
    return
  }
  try {
    if ((await findCrossOriginHeadersAssignment(resourcesDir)) !== false) {
      return
    }
  } catch (e: any) {
    log.debug({ resourcesDir, error: e?.message ?? String(e) }, "cannot check whether the app sets autoUpdater.crossOriginHeaders")
    return
  }
  log.warn(
    {
      solution:
        "set autoUpdater.crossOriginHeaders to a function before the app checks for updates, e.g. autoUpdater.crossOriginHeaders = () => [] " +
        "to send none of the app's request headers to another origin than the update feed",
    },
    "found no assignment to autoUpdater.crossOriginHeaders in the app's JavaScript (outside node_modules). Without a function there, " +
      "electron-updater rejects every update check and download of the installed app with ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED. " +
      "This check is a heuristic: if the app sets it in a way the build cannot see (bracket notation, Object.assign, a dependency), check for updates once from a packaged build to confirm. " +
      "See https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers"
  )
}

/**
 * Whether the app's own `.js`/`.mjs`/`.cjs` files in `resourcesDir` assign `crossOriginHeaders` (see {@link assignsCrossOriginHeaders}),
 * or null when the resources hold neither app.asar nor an app directory. The packed tree comes from the project, which is not trusted:
 * only regular files are read, never a symlink, and no file larger than {@link MAX_SCANNED_FILE_SIZE}.
 */
async function findCrossOriginHeadersAssignment(resourcesDir: string): Promise<boolean | null> {
  const isScanned = (name: string, stat: Stats | Node | null, mustBeRegularFile = false) =>
    stat != null &&
    (!mustBeRegularFile || ("isFile" in stat && stat.isFile())) &&
    SCANNED_EXTENSIONS.has(path.extname(name).toLowerCase()) &&
    (stat.size ?? Infinity) <= MAX_SCANNED_FILE_SIZE
  const lstatOrNull = (file: string) => lstat(file).catch(() => null)

  const asarFile = path.join(resourcesDir, "app.asar")
  if ((await lstatOrNull(asarFile))?.isFile()) {
    const asar = await readAsar(asarFile)
    const files: Array<[string, Node]> = []
    const collect = (dir: Node, dirPath: string) => {
      for (const [name, node] of Object.entries(dir.files ?? {})) {
        const nodePath = path.join(dirPath, name)
        if (node.files != null) {
          if (name !== "node_modules") {
            collect(node, nodePath)
          }
          // a link has no size, so it is not read (its target is, where that is a file of the archive)
        } else if (isScanned(name, node)) {
          files.push([nodePath, node])
        }
      }
    }
    collect(asar.header, "")
    for (const [file, node] of files) {
      // an unpacked file is read from app.asar.unpacked: only a regular file within the size limit
      if (node.unpacked === true && !isScanned(file, await lstatOrNull(path.join(`${asarFile}.unpacked`, file)), true)) {
        continue
      }
      if (assignsCrossOriginHeaders((await asar.readFile(file)).toString("utf8"))) {
        return true
      }
    }
    return false
  }

  const appDir = path.join(resourcesDir, "app")
  if (!(await lstatOrNull(appDir))?.isDirectory()) {
    return null
  }
  const pending = [appDir]
  for (let dir = pending.pop(); dir != null; dir = pending.pop()) {
    const entries: Array<Dirent> = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") {
          pending.push(file)
        }
      } else if (isScanned(entry.name, await lstatOrNull(file), true) && assignsCrossOriginHeaders(await readFile(file, "utf8"))) {
        return true
      }
    }
  }
  return false
}

/**
 * Whether the JavaScript `source` assigns a value to a `crossOriginHeaders` property ({@link CROSS_ORIGIN_HEADERS_ASSIGNMENT}) outside its
 * comments and its string, template and regular expression literals: a bundled electron-updater names `autoUpdater.crossOriginHeaders = () => []`
 * in its docs and error messages. A light tokenizer, not a parser: a `/` after `)` or `]` is taken for a division.
 */
function assignsCrossOriginHeaders(source: string): boolean {
  if (!source.includes("crossOriginHeaders")) {
    return false
  }
  let code = ""
  let codeStart = 0
  let slashStartsRegExp = true
  let i = 0
  while (i < source.length) {
    const c = source[i]
    let end = -1
    if (c === "/" && source[i + 1] === "/") {
      const lineEnd = source.indexOf("\n", i)
      end = lineEnd < 0 ? source.length : lineEnd
    } else if (c === "/" && source[i + 1] === "*") {
      const commentEnd = source.indexOf("*/", i + 2)
      end = commentEnd < 0 ? source.length : commentEnd + 2
    } else if (c === '"' || c === "'" || c === "`" || (c === "/" && slashStartsRegExp)) {
      end = literalEnd(source, i)
      slashStartsRegExp = false
    }
    if (end >= 0) {
      code += `${source.slice(codeStart, i)} `
      i = codeStart = end
      continue
    }
    IDENTIFIER.lastIndex = i
    const word = IDENTIFIER.exec(source)
    if (word != null) {
      slashStartsRegExp = KEYWORDS_BEFORE_EXPRESSION.has(word[0])
      i += word[0].length
      continue
    }
    if (c.trim() !== "") {
      slashStartsRegExp = c !== ")" && c !== "]"
    }
    i++
  }
  return CROSS_ORIGIN_HEADERS_ASSIGNMENT.test(code + source.slice(codeStart))
}

/** The index after the string, template or regular expression literal at `start`; an unterminated string or regular expression ends at its line end. */
function literalEnd(source: string, start: number): number {
  const quote = source[start]
  let inCharacterClass = false
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i]
    if (c === "\\") {
      i++
    } else if (quote === "`") {
      if (c === "`") {
        return i + 1
      }
      if (c === "$" && source[i + 1] === "{") {
        i = templateExpressionEnd(source, i + 2) - 1
      }
    } else if (c === "\n" || c === "\r") {
      return i
    } else if (quote !== "/") {
      if (c === quote) {
        return i + 1
      }
    } else if (c === "[" || c === "]") {
      inCharacterClass = c === "["
    } else if (c === "/" && !inCharacterClass) {
      return i + 1
    }
  }
  return source.length
}

/** The index after the `}` that closes the template expression starting at `start` (after its `${`). */
function templateExpressionEnd(source: string, start: number): number {
  let depth = 0
  for (let i = start; i < source.length; i++) {
    const c = source[i]
    if (c === '"' || c === "'" || c === "`") {
      i = literalEnd(source, i) - 1
    } else if (c === "{") {
      depth++
    } else if (c === "}") {
      if (depth === 0) {
        return i + 1
      }
      depth--
    }
  }
  return source.length
}
