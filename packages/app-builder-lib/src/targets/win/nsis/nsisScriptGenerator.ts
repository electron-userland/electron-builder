import { InvalidConfigurationError, log } from "builder-util"

export class NsisScriptGenerator {
  private readonly lines: Array<string> = []

  addIncludeDir(file: string) {
    this.lines.push(`!addincludedir ${nsisQuotePath(file)}`)
  }

  addPluginDir(pluginArch: string, dir: string) {
    this.lines.push(`!addplugindir /${pluginArch} ${nsisQuotePath(dir)}`)
  }

  include(file: string) {
    this.lines.push(`!include ${nsisQuotePath(file)}`)
  }

  macro(name: string, lines: Array<string> | NsisScriptGenerator) {
    this.lines.push(`!macro ${name}`, `  ${(Array.isArray(lines) ? lines : lines.lines).join("\n  ")}`, `!macroend\n`)
  }

  file(outputName: string | null, file: string) {
    this.lines.push(`File${outputName == null ? "" : ` "/oname=${outputName}"`} ${nsisQuotePath(file)}`)
  }

  insertMacro(name: string, parameters: string) {
    this.lines.push(`!insertmacro ${name} ${parameters}`)
  }

  // without -- !!!
  flags(flags: Array<string>) {
    for (const flagName of flags) {
      const variableName = getVarNameForFlag(flagName).replace(/-+(\w)?/g, (m, p1) => (p1 ?? "").toUpperCase())
      this.lines.push(`!macro _${variableName} _a _b _t _f
  $\{StdUtils.TestParameter} $R9 "${flagName}"
  StrCmp "$R9" "true" \`$\{_t}\` \`$\{_f}\`
!macroend
!define ${variableName} \`"" ${variableName} ""\`
`)
    }
  }

  build() {
    return this.lines.join("\n") + "\n"
  }
}

/**
 * Quotes a file path for the generated NSIS script. A double quote, line break or NUL in the path would end the quoted string
 * and the rest of the path would be read as script; a backtick is NSIS's other string delimiter. Such a path fails the build
 * instead of being escaped.
 */
export function nsisQuotePath(file: string): string {
  if (/["`\r\n\0]/.test(file)) {
    throw new InvalidConfigurationError(
      `Cannot write ${JSON.stringify(file)} into the NSIS script: the path contains a double quote, backtick, line break or NUL character. Rename the file or directory.`
    )
  }
  return `"${file}"`
}

export function nsisEscapeString(s: string): string {
  const escaped = s
    .replace(/\r\n|\r|\n/g, " ") // newlines break NSIS string literals
    .replace(/\$(?![{(])/g, "$$$$") // bare $ → $$ (prevents NSIS variable expansion); ${...} define and $(...) LangString references are left intact
    .replace(/"/g, '$\\"') // " → $\" (NSIS escape for double-quote)
    .replace(/`/g, "$\\`") // ` → $\` (NSIS escape for backtick, which delimits strings in macro bodies such as FileAssociation.nsh)
  if (escaped !== s) {
    log.debug({ original: s, final: escaped }, "nsis was escaped")
  }
  return escaped
}

function getVarNameForFlag(flagName: string): string {
  if (flagName === "allusers") {
    return "isForAllUsers"
  }
  if (flagName === "currentuser") {
    return "isForCurrentUser"
  }
  return "is" + flagName[0].toUpperCase() + flagName.substring(1)
}
