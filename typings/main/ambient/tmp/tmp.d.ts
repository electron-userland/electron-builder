// Compiled using typings@0.6.8
// Source: https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/48f20e97bfaf70fc1a9537b38aed98e9749be0ae/tmp/tmp.d.ts
// Type definitions for tmp v0.0.28
// Project: https://www.npmjs.com/package/tmp
// Definitions by: Jared Klopper <https://github.com/optical>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare module "tmp" {
  export interface TmpFileOptions extends TmpOptions {
    mode?: number;
  }

  export interface TmpOptions {
    prefix?: string;
    postfix?: string;

    template?: string;
    dir?: string;
    tries?: number;
    keep?: boolean;
    unsafeCleanup?: boolean;
  }

  interface SynchrounousResult {
    name: string;
    fd: number;
    removeCallback: () => void;
  }

  function file(callback: (err: any, path: string, fd: number, cleanupCallback: () => void) => void): void;
  function file(config: TmpFileOptions, callback?: (err: any, path: string, fd: number, cleanupCallback: () => void) => void): void;

  function fileSync(config?: TmpFileOptions): SynchrounousResult;

  export function dir(callback: (err: any, path: string, cleanupCallback: () => void) => void): void;
  export function dir(config: TmpFileOptions, callback?: (err: any, path: string, cleanupCallback: () => void) => void): void;

  function dirSync(config?: TmpFileOptions): SynchrounousResult;

  function tmpName(callback: (err: any, path: string) => void): void;
  function tmpName(config: TmpOptions, callback?: (err: any, path: string) => void): void;

  function tmpNameSync(config?: TmpOptions): string;

  function setGracefulCleanup(): void;
}