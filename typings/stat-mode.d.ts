declare module "stat-mode" {
  import { Stats } from "fs"

  interface Permissions {
    read: boolean
    write: boolean
    execute: boolean
  }

  export default class Mode {
    constructor(stats: Stats)

    owner: Permissions
    group: Permissions
    others: Permissions

    toOctal(): string
  }
}