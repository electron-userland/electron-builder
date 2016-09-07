declare module "uuid-1345" {
  interface NameUuidOptions {
    namespace: string
    name: string
  }

  interface TimeBasedUuidOptions {
    mac: boolean
  }

  export function v5(options: NameUuidOptions, callback: (error: Error, result: string) => void): void
  export function v4(callback: (error: Error, result: string) => void): void
  export function v1(options: TimeBasedUuidOptions, callback: (error: Error, result: string) => void): void
}