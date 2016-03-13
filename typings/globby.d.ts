declare module "globby" {
  interface GlobOptions {
    cwd?: string
  }

  function globby(patterns: Array<string>, options?: GlobOptions): Promise<Array<string>>

  export = globby
}