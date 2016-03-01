const mapping: {[key: string]: string} = {
  osx: "../lib/osx",
  win: "../lib/win",
  win32: "../lib/win",
  linux: "../lib/linux"
}

export = function (platform: string): any {
  const result = mapping[platform]
  if (result == null) {
    throw new Error(`Building for ${platform} is not supported`)
  }
  return require(result)
}
