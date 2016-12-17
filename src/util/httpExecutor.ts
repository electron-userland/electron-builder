import { Url } from "url"
import { NodeHttpExecutor } from "./nodeHttpExecutor"

export interface DownloadOptions {
  skipDirCreation?: boolean
  sha2?: string
}

export class HttpExecutorHolder {
  get httpExecutor(): HttpExecutor {
    return this._httpExecutor
  }

  set httpExecutor(value: HttpExecutor) {
    this._httpExecutor = value
  }

  constructor(private _httpExecutor: HttpExecutor) {}
}

export interface HttpExecutor {
  request<T>(url: Url, token?: string | null, data?: {[name: string]: any; } | null, method?: string): Promise<T>
  download(url: string, destination: string, options?: DownloadOptions | null): Promise<string>
}


export class HttpError extends Error {
  constructor(public response: {statusMessage?: string | undefined, statusCode?: number | undefined, headers?: { [key: string]: string[]; } | undefined}, public description: any = null) {
    super(response.statusCode + " " + response.statusMessage + (description == null ? "" : ("\n" + JSON.stringify(description, <any>null, "  "))) + "\nHeaders: " + JSON.stringify(response.headers, <any>null, "  "))
  }
}

export var executorHolder  = new HttpExecutorHolder(new NodeHttpExecutor())
