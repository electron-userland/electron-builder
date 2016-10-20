declare module "mime" {
  class Mime {
    charsets: Charsets;
    default_type: string;

    lookup(path: string): string;

    extension(mime: string): string;

    load(filepath: string): void;

    define(mimes: Object): void;
  }

  interface Charsets {
    lookup(mime: string): string;
  }

  const mime: Mime
  export default mime
}