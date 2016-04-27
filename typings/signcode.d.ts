declare module "signcode-tf" {
  export interface SignOptions {
    path: string
    cert: string
    name?: string
    password: string
    site?: string
    hash?: Array<string>
    overwrite?: boolean
  }

  export function sign(options: SignOptions, callback: (error: Error) => void): void
}