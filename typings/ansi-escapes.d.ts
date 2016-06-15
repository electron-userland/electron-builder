declare module "ansi-escapes" {
  export function eraseLines(count: number): void
}

declare module "cli-cursor" {
  function show(): void
  function hide(): void
}