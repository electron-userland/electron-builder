declare module "mime" {
  class Mime {
    getType(path: string): string | null
  }

  const mime: Mime
  export default mime
}