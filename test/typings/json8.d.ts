declare module "json8" {
  export function equal(a: any, b: any): boolean
  export function serialize(value: any, options?: any): string
}