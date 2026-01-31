import { CancellationToken } from "./CancellationToken.js"

export async function retry<T>(
  task: () => Promise<T>,
  options: { retries: number; interval: number; backoff?: number; attempt?: number; cancellationToken?: CancellationToken; shouldRetry?: (e: any) => boolean | Promise<boolean> }
): Promise<T> {
  const { retries: retryCount, interval, backoff = 0, attempt = 0, shouldRetry, cancellationToken = new CancellationToken() } = options
  try {
    return await task()
  } catch (error: any) {
    if ((await Promise.resolve(shouldRetry?.(error) ?? true)) && retryCount > 0 && !cancellationToken.cancelled) {
      await new Promise(resolve => setTimeout(resolve, interval + backoff * attempt))
      return await retry(task, { ...options, retries: retryCount - 1, attempt: attempt + 1 })
    } else {
      throw error
    }
  }
}
