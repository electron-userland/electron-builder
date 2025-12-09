import { exec, ExtraSpawnOptions, spawn } from "builder-util"
import { ExecFileOptions, SpawnOptions } from "child_process"
<<<<<<< HEAD
import { VmManager } from "./vm.js"
=======
import { VmManager } from "./vm.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)

export class MonoVmManager extends VmManager {
  constructor() {
    super()
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
    return exec(
      "mono",
      [file].concat(args),
      {
        ...options,
      },
      isLogOutIfDebug
    )
  }

  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    return spawn("mono", [file].concat(args), options, extraOptions)
  }
}
