import { exec, ExecOptions } from "builder-util"

export async function parseVmList() {
  let rawList = await exec("prlctl", ["list", "-i", "-s", "name"])
  rawList = rawList.substring(rawList.indexOf("ID:"))

  // let match: Array<string> | null
  const result: Array<ParallelsVm> = []
  for (const info of rawList.split("\n\n").map(it => it.trim()).filter(it => it.length > 0)) {
    const vm: any = {}
    for (const line of info.split("\n")) {
      const meta = /^([^:("]+): (.*)$/.exec(line)
      if (meta == null) {
        continue
      }

      const key = meta[1].toLowerCase()
      if (key === "id" || key === "os" || key === "name") {
        vm[key] = meta[2].trim()
      }
    }
    result.push(vm)
  }
  return result
}

export function execParallels(vm: ParallelsVm, file: string, args: Array<string>, options?: ExecOptions): Promise<string> {
  return exec("prlctl", ["exec", vm.id, file.startsWith("/") ? macPathToParallelsWindows(file) : file].concat(args), options)
}

export function macPathToParallelsWindows(file: string) {
  return "\\\\Mac\\Host\\\\" + file
}

export interface ParallelsVm {
  id: string
  os: "win-10" | "ubuntu" | "elementary"
}