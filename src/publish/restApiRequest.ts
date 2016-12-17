import { Url } from "url"
import { HttpExecutor, executorHolder } from "../util/httpExecutor"

export function githubRequest<T>(path: string, token: string | null, data: {[name: string]: any; } | null = null, method: string = "GET", httpExecutor: HttpExecutor = executorHolder.httpExecutor): Promise<T> {
  return request<T>({hostname: "api.github.com", path: path}, token, data, method, httpExecutor)
}

export function bintrayRequest<T>(path: string, auth: string | null, data: {[name: string]: any; } | null = null, method: string = "GET",  httpExecutor: HttpExecutor = executorHolder.httpExecutor): Promise<T> {
  return request<T>({hostname: "api.bintray.com", path: path}, auth, data, method, httpExecutor)
}

export function request<T>(url: Url, token: string | null = null, data: {[name: string]: any; } | null = null, method: string = "GET",  httpExecutor: HttpExecutor = executorHolder.httpExecutor): Promise<T> {

  return httpExecutor.request(url, token, data, method)
}