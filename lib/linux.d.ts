declare class Linux {
  build(options: any, callback: (error: Error, path: string) => void): void
}

export function init(): Linux
