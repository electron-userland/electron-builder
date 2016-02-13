declare namespace appdmg {
  interface Specification {
    title: string
    background: string
    icon: string
    "icon-size": number

    contents: Array<any>
  }

  interface Options {
    target: string
    basepath: string
    specification: appdmg.Specification
  }
}

declare module "appdmg" {
  import { EventEmitter } from "events"

  function appdmg(options: appdmg.Options): EventEmitter

  export = appdmg
}