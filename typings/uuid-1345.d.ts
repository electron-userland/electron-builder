declare module "uuid-1345" {
  interface NameUuidOptions {
    namespace: string
    name: string
  }

  export function v5(options: NameUuidOptions, callback: (error: Error, result: string) => void): void
}