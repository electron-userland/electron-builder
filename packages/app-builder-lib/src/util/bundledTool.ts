import { stripSensitiveEnvVars } from "builder-util"
import { Nullish } from "builder-util-runtime"

export interface ToolInfo {
  path: string
  env?: any
}

export function computeEnv(oldValue: string | Nullish, newValues: Array<string>): string {
  const parsedOldValue = oldValue ? oldValue.split(":") : []
  return newValues
    .concat(parsedOldValue)
    .filter(it => it.length > 0)
    .join(":")
}

export function computeToolEnv(libPath: Array<string>): any {
  // noinspection SpellCheckingInspection
  return {
    ...stripSensitiveEnvVars(process.env),
    DYLD_LIBRARY_PATH: computeEnv(process.env.DYLD_LIBRARY_PATH, libPath),
  }
}

// Publish credentials and the update-manifest signing key: electron-builder itself reads them to publish and to sign update info.
const PUBLISH_CREDENTIAL_ENV_NAMES = new Set([
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GITHUB_RELEASE_TOKEN",
  "GITLAB_TOKEN",
  "BITBUCKET_TOKEN",
  "BT_TOKEN",
  "KEYGEN_TOKEN",
  "CF_R2_ACCESS_KEY_ID",
  "CF_R2_SECRET_ACCESS_KEY",
  "DO_KEY_ID",
  "DO_SECRET_KEY",
  "SNAP_CSC_LINK",
  "SNAPCRAFT_STORE_CREDENTIALS",
  "SNAPCRAFT_STORE_AUTH",
  "ELECTRON_BUILDER_UPDATE_SIGN_KEY",
])

/**
 * The environment of a build tool that can run signing commands (signtool, osslsigncode, and makensis with `!finalize` / `!uninstfinalize`):
 * the build's environment without the publish credentials, which none of them needs, plus the tool's own variables.
 * Everything else is kept, including signing settings: `CSC_*` / `WIN_CSC_*` and the variables a signing provider
 * (a PKCS#11 module, a CSP/KSP backed by a cloud key store) reads to authenticate, such as `AWS_*` or `AZURE_*`.
 * Names are compared case-insensitively, as Windows does.
 */
export function envWithoutPublishCredentials(toolEnv: NodeJS.ProcessEnv | Nullish): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (!PUBLISH_CREDENTIAL_ENV_NAMES.has(name.toUpperCase())) {
      env[name] = value
    }
  }
  return { ...env, ...toolEnv }
}
