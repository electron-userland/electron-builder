import * as path from "path"
import { NsisUpdater } from "../../../packages/electron-updater/src/NsisUpdater"
import { afterEach, vi } from "vitest"
import { createTestAppAdapter, tuneTestUpdater } from "../helpers/updaterTestUtil"

const ORIGINAL_EXEC_PATH = process.execPath
const ORIGINAL_PLATFORM = process.platform
const ORIGINAL_RESOURCES_PATH = (process as any).resourcesPath

const setProcessPlatform = (value: string) => {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value,
  })
}

const setExecPath = (value: string) => {
  Object.defineProperty(process, "execPath", {
    configurable: true,
    value,
  })
}

const setResourcesPath = (value: string | undefined) => {
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value,
  })
}

const mockRegistryQuery = (updater: any, ...responses: Array<string>) => {
  let index = 0
  updater.queryRegistry = vi.fn().mockImplementation(() => responses[index++] ?? "")
}

const createUpdaterForInstallTest = async () => {
  const appAdapter = await createTestAppAdapter()
  const updater = new NsisUpdater(null, appAdapter) as any
  tuneTestUpdater(updater)
  updater.downloadedUpdateHelper = {
    file: "C:\\Temp\\Installer.exe",
    packageFile: null,
  }
  updater.dispatchError = vi.fn()
  updater.spawnLog = vi.fn().mockResolvedValue(true)
  updater.logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  return updater
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  setProcessPlatform(ORIGINAL_PLATFORM)
  setExecPath(ORIGINAL_EXEC_PATH)
  setResourcesPath(ORIGINAL_RESOURCES_PATH)
})

test.sequential("uses /allusers when registry points to custom per-machine install", async ({ expect }) => {
  setProcessPlatform("win32")
  setExecPath("D:\\Apps\\Demo\\Demo.exe")
  setResourcesPath("C:\\Resources")
  vi.stubEnv("LOCALAPPDATA", "C:\\Users\\Payne\\AppData\\Local")
  const updater = await createUpdaterForInstallTest()
  expect(updater._testOnlyOptions?.platform).toBe("win32")
  mockRegistryQuery(
    updater,
    `HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DemoApp
    InstallLocation    REG_SZ    D:\\Apps\\Demo
    QuietUninstallString    REG_SZ    "D:\\Apps\\Demo\\Uninstall Demo.exe" /allusers /S
`,
    "",
    ""
  )
  const didInstall = updater.doInstall({
    isSilent: true,
    isForceRunAfter: false,
    isAdminRightsRequired: false,
  })

  expect(didInstall).toBe(true)
  expect(updater.spawnLog).toHaveBeenCalledTimes(1)
  expect(updater.spawnLog).toHaveBeenCalledWith(path.join("C:\\Resources", "elevate.exe"), ["C:\\Temp\\Installer.exe", "--updated", "/S", "/allusers"])
})

test.sequential("uses /currentuser when registry points to current-user install", async ({ expect }) => {
  setProcessPlatform("win32")
  setExecPath("D:\\Custom\\Demo\\Demo.exe")
  vi.stubEnv("PROGRAMFILES", "C:\\Program Files")
  const updater = await createUpdaterForInstallTest()
  mockRegistryQuery(
    updater,
    `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DemoApp
    DisplayIcon    REG_SZ    D:\\Custom\\Demo\\Demo.exe,0
    UninstallString    REG_SZ    "D:\\Custom\\Demo\\Uninstall Demo.exe" /currentuser
`,
    "",
    ""
  )
  const didInstall = updater.doInstall({
    isSilent: true,
    isForceRunAfter: false,
    isAdminRightsRequired: false,
  })

  expect(didInstall).toBe(true)
  expect(updater.spawnLog).toHaveBeenCalledWith("C:\\Temp\\Installer.exe", ["--updated", "/S", "/currentuser"])
})

test.sequential("falls back to /allusers by Program Files path when registry is not available", async ({ expect }) => {
  setProcessPlatform("win32")
  setExecPath("C:\\Program Files\\Demo\\Demo.exe")
  setResourcesPath("C:\\Resources")
  vi.stubEnv("PROGRAMFILES", "C:\\Program Files")
  vi.stubEnv("LOCALAPPDATA", "C:\\Users\\Payne\\AppData\\Local")
  const updater = await createUpdaterForInstallTest()
  mockRegistryQuery(updater, "", "", "")
  updater.doInstall({
    isSilent: true,
    isForceRunAfter: false,
    isAdminRightsRequired: false,
  })

  expect(updater.spawnLog).toHaveBeenCalledWith(path.join("C:\\Resources", "elevate.exe"), ["C:\\Temp\\Installer.exe", "--updated", "/S", "/allusers"])
})

test.sequential("falls back to /currentuser by LocalAppData path when registry is not available", async ({ expect }) => {
  setProcessPlatform("win32")
  setExecPath("C:\\Users\\Payne\\AppData\\Local\\Programs\\Demo\\Demo.exe")
  vi.stubEnv("LOCALAPPDATA", "C:\\Users\\Payne\\AppData\\Local")
  const updater = await createUpdaterForInstallTest()
  mockRegistryQuery(updater, "", "", "")
  updater.doInstall({
    isSilent: true,
    isForceRunAfter: false,
    isAdminRightsRequired: false,
  })

  expect(updater.spawnLog).toHaveBeenCalledWith("C:\\Temp\\Installer.exe", ["--updated", "/S", "/currentuser"])
})

test.sequential("does not append install mode if it cannot be determined", async ({ expect }) => {
  setProcessPlatform("win32")
  setExecPath("D:\\Portable\\Demo\\Demo.exe")
  vi.stubEnv("LOCALAPPDATA", "C:\\Users\\Payne\\AppData\\Local")
  vi.stubEnv("PROGRAMFILES", "C:\\Program Files")
  const updater = await createUpdaterForInstallTest()
  mockRegistryQuery(updater, "", "", "")
  updater.doInstall({
    isSilent: true,
    isForceRunAfter: false,
    isAdminRightsRequired: false,
  })

  expect(updater.spawnLog).toHaveBeenCalledWith("C:\\Temp\\Installer.exe", ["--updated", "/S"])
})

test.sequential("forces /allusers for admin-required updates", async ({ expect }) => {
  setProcessPlatform("win32")
  setResourcesPath("C:\\Resources")

  const updater = await createUpdaterForInstallTest()
  updater.doInstall({
    isSilent: true,
    isForceRunAfter: false,
    isAdminRightsRequired: true,
  })

  expect(updater.spawnLog).toHaveBeenCalledWith(path.join("C:\\Resources", "elevate.exe"), ["C:\\Temp\\Installer.exe", "--updated", "/S", "/allusers"])
})
