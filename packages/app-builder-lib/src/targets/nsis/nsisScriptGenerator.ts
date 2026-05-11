import { log } from "builder-util"

export class NsisScriptGenerator {
  private readonly lines: Array<string> = []

  addIncludeDir(file: string) {
    this.lines.push(`!addincludedir "${file}"`)
  }

  addPluginDir(pluginArch: string, dir: string) {
    this.lines.push(`!addplugindir /${pluginArch} "${dir}"`)
  }

  include(file: string) {
    this.lines.push(`!include "${file}"`)
  }

  macro(name: string, lines: Array<string> | NsisScriptGenerator) {
    this.lines.push(`!macro ${name}`, `  ${(Array.isArray(lines) ? lines : lines.lines).join("\n  ")}`, `!macroend\n`)
  }

  file(outputName: string | null, file: string) {
    const safeName = outputName == null ? null : nsisEscapeString(outputName)
    this.lines.push(`File${safeName == null ? "" : ` "/oname=${safeName}"`} "${file}"`)
  }

  insertMacro(name: string, parameters: string) {
    this.lines.push(`!insertmacro ${name} ${parameters}`)
  }

  // without -- !!!
  flags(flags: Array<string>) {
    for (const flagName of flags) {
      const variableName = getVarNameForFlag(flagName).replace(/[-]+(\w|$)/g, (m, p1) => p1.toUpperCase())
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

export function nsisEscapeString(s: string): string {
  const escaped = s
    .replace(/\r\n|\r|\n/g, " ") // newlines break NSIS string literals
    .replace(/\$/g, "$$$$") // $ → $$ (prevents NSIS variable expansion)
    .replace(/"/g, '$\\"') // " → $\" (NSIS escape for double-quote)
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
