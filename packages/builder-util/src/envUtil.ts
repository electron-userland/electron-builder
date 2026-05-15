export function parseValidEnvVarUrl(envVarName: string): string | null {
  const url = process.env[envVarName]?.trim()
  if (url == null || url === "") {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${envVarName} is not a valid URL: ${url}`)
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${envVarName} must use https:// (got ${parsed.protocol})`)
  }
  return url
}
