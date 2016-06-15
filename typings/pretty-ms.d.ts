// ms reports too rounded values compared to pretty-ms
declare module "pretty-ms" {
  function prettyMs(ms: number): string

  export= prettyMs
}