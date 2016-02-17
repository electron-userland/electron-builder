declare module "command-line-args" {
  interface Options {
    parse(): any

    getUsage(options?: UsageOptions): any
  }

  interface UsageOptions {
    hide?: Array<string>
    
    title?: string
    footer?: string
  }

  function describe(options: Array<any>): Options

  export = describe
}