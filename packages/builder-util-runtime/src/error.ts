export function newError(message: string, code: string) {
  const error = new Error(message)
  ;(error as NodeJS.ErrnoException).code = code
  return error
}

/**
 * Renders a caught value for logs and error messages: the stack trace when there is one, else the message, else `String(value)`.
 * Never throws.
 */
export function errorToString(error: unknown): string {
  try {
    if (error != null && typeof error === "object") {
      if ("stack" in error && typeof error.stack === "string" && error.stack.length > 0) {
        return error.stack
      }
      if ("message" in error && typeof error.message === "string" && error.message.length > 0) {
        return error.message
      }
    }
    return String(error)
  } catch {
    return "[unprintable error]"
  }
}
