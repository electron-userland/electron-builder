import { CancellationToken } from "./CancellationToken"

export async function retry<T>(
  task: () => Promise<T>,
  retryCount: number,
  interval: number,
  backoff = 0,
  attempt = 0,
  shouldRetry?: (delay: number, e: any) => boolean
): Promise<T> {
  const cancellationToken = new CancellationToken()
  try {
    return await task()
  } catch (error: any) {
    const delay = interval + backoff * attempt
    if ((shouldRetry?.(delay, error) ?? true) && retryCount > 0 && !cancellationToken.cancelled) {
      await new Promise(resolve => setTimeout(resolve, delay))
      return await retry(task, retryCount - 1, interval, backoff, attempt + 1, shouldRetry)
    } else {
      throw error
    }
  }
}
