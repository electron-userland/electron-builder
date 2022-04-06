export function nsisWebDifferentialUpdateTestFakeSnapshot() {
  // to  avoid snapshot mismatch (since in this node app is not packed)
  expect({
    win: [
      {
        file: "latest.yml",
        fileContent: {
          files: [
            {
              sha512: "@sha512",
              url: "Test App ßW Web Setup 1.0.0.exe",
            },
          ],
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.0-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
          path: "Test App ßW Web Setup 1.0.0.exe",
          releaseDate: "@releaseDate",
          sha2: "@sha2",
          sha512: "@sha512",
          version: "1.0.0",
        },
      },
      {
        arch: "x64",
        file: "Test App ßW Web Setup 1.0.0.exe",
        safeArtifactName: "TestApp-WebSetup-1.0.0.exe",
        updateInfo: {
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.0-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
        },
      },
      {
        arch: "x64",
        file: "TestApp-1.0.0-x64.nsis.7z",
      },
    ],
  }).toMatchSnapshot()
  expect({
    win: [
      {
        file: "latest.yml",
        fileContent: {
          files: [
            {
              sha512: "@sha512",
              url: "Test App ßW Web Setup 1.0.1.exe",
            },
          ],
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.1-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
          path: "Test App ßW Web Setup 1.0.1.exe",
          releaseDate: "@releaseDate",
          sha2: "@sha2",
          sha512: "@sha512",
          version: "1.0.1",
        },
      },
      {
        arch: "x64",
        file: "Test App ßW Web Setup 1.0.1.exe",
        safeArtifactName: "TestApp-WebSetup-1.0.1.exe",
        updateInfo: {
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.1-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
        },
      },
      {
        arch: "x64",
        file: "TestApp-1.0.1-x64.nsis.7z",
      },
    ],
  }).toMatchSnapshot()
}

export function nsisDifferentialUpdateFakeSnapshot() {
  // to  avoid snapshot mismatch (since in this node app is not packed)
  expect({
    win: [
      {
        file: "latest.yml",
        fileContent: {
          files: [
            {
              sha512: "@sha512",
              url: "Test App ßW Web Setup 1.0.0.exe",
            },
          ],
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.0-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
          path: "Test App ßW Web Setup 1.0.0.exe",
          releaseDate: "@releaseDate",
          sha2: "@sha2",
          sha512: "@sha512",
          version: "1.0.0",
        },
      },
      {
        arch: "x64",
        file: "Test App ßW Web Setup 1.0.0.exe",
        safeArtifactName: "TestApp-WebSetup-1.0.0.exe",
        updateInfo: {
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.0-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
        },
      },
      {
        arch: "x64",
        file: "TestApp-1.0.0-x64.nsis.7z",
      },
    ],
  }).toMatchSnapshot()
  expect({
    win: [
      {
        file: "latest.yml",
        fileContent: {
          files: [
            {
              sha512: "@sha512",
              url: "Test App ßW Web Setup 1.0.1.exe",
            },
          ],
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.1-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
          path: "Test App ßW Web Setup 1.0.1.exe",
          releaseDate: "@releaseDate",
          sha2: "@sha2",
          sha512: "@sha512",
          version: "1.0.1",
        },
      },
      {
        arch: "x64",
        file: "Test App ßW Web Setup 1.0.1.exe",
        safeArtifactName: "TestApp-WebSetup-1.0.1.exe",
        updateInfo: {
          packages: {
            x64: {
              blockMapSize: "@blockMapSize",
              headerSize: "@headerSize",
              path: "TestApp-1.0.1-x64.nsis.7z",
              sha512: "@sha512",
              size: "@size",
            },
          },
        },
      },
      {
        arch: "x64",
        file: "TestApp-1.0.1-x64.nsis.7z",
      },
    ],
  }).toMatchSnapshot()
}
