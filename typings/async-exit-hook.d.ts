declare module "async-exit-hook" {
  export default function(handler: (callback: () => void) => void): void
}