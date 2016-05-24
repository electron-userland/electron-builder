declare module "signcode-tf" {
  export interface SignOptions {
    path: string
    cert: string
    name?: string | null
    password: string
    site?: string | null
    hash?: Array<string> | null
    signcodePath?: string | null
    overwrite?: boolean
  }

  export function sign(options: SignOptions, callback: (error: Error | null) => void): void
}