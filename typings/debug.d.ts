declare module "debug" {
  export default function debug(namespace: string): debug.Debugger
}

declare namespace debug {
  export interface Debugger {
    (formatter: any, ...args: any[]): void

    enabled: boolean;
    log: Function;
    namespace: string;
  }
}