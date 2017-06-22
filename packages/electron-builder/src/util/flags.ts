export function isUseSystemWine() {
  return isEnvTrue(process.env.USE_SYSTEM_WINE)
}

export function isUseSystemSigncode() {
  return isEnvTrue(process.env.USE_SYSTEM_SIGNCODE)
}

function isEnvTrue(value: string | null) {
  if (value != null) {
    value = value.trim()
  }
  return value === "true" || value === "" || value === "1"
}