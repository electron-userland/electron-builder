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
    this.lines.push(
      `!macro ${name}`,
      `  ${(Array.isArray(lines) ? lines : (lines as NsisScriptGenerator).lines).join("\n  ")}`,
      `!macroend\n`
    )
  }

  file(outputName: string | null, file: string) {
    this.lines.push(`File${outputName == null ? "" : ` "/oname=${outputName}"`} "${file}"`)
  }

  insertMacro(name: string, parameters: string) {
    this.lines.push(`!insertmacro ${name} ${parameters}`)
  }

  // without -- !!!
  flags(flags: Array<string>) {
    for (const flagName of flags) {
      const variableName = getVarNameForFlag(flagName)
        .replace(/[\-]+(\w|$)/g, (m, p1) => p1.toUpperCase())
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

function getVarNameForFlag(flagName: string): string {
  if (flagName === "allusers") {
    return "isForAllUsers"
  }
  if (flagName === "currentuser") {
    return "isForCurrentUser"
  }
  return "is" + flagName[0].toUpperCase() + flagName.substring(1)
}