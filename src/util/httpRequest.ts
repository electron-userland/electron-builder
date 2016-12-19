import { DownloadOptions, executorHolder } from "./httpExecutor"


export function download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
  return executorHolder.httpExecutor.download(url, destination, options)
}