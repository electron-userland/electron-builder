declare module "uuid-1345" {
  interface NameUuidOptions {
    namespace: string | Buffer
    name: string | Buffer
    encoding?: "binary" | "ascii" | "object"
  }

  interface TimeBasedUuidOptions {
    mac: boolean
  }

  export function v5(options: NameUuidOptions, callback: (error: Error, result: string) => void): void

  export function v5(options: NameUuidOptions): string

  export function v4(callback: (error: Error, result: string) => void): void

  export function v1(options: TimeBasedUuidOptions, callback: (error: Error, result: string) => void): void

  export function parse(guid: string): Buffer

  export function stringify(guid: Buffer): string

  export const namespace: any

  export function check(id: string): any
}