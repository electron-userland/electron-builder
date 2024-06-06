export function newError(message: string, code: string) {
  const error = new Error(message)
  ;(error as NodeJS.ErrnoException).code = code
  return error
}
