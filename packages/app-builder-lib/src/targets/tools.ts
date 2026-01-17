import * as path from "path";
import * as fs from "fs/promises";
import * as crypto from "crypto";
import * as os from "os";
import * as tar from "tar";
import * as lockfile from "proper-lockfile";
import * as get from "@electron/get";
import { ElectronDownloadRequest, ElectronDownloadRequestOptions, ElectronGenericArtifactDetails, ElectronPlatformArtifactDetailsWithDefaults } from "@electron/get";

export async function getBinFromUrl(
  releaseName: string,
  filenameWithExt: string,
  checksums: Record<string, string>,
  githubOrgRepo = "electron-userland/electron-builder-binaries"
): Promise<string> {
  const progressBar = progress?.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent | ${artifactName}`, { total: 100 })
  progressBar?.render()

  const downloadOptions: GotDownloaderOptions = {
    getProgressCallback: progress => {
      progressBar?.update(progress.percent)
      return Promise.resolve()
    },
  }

  const dist = await _getBinFromUrl({ ...artifactConfig, downloadOptions })
  progressBar?.update(100)
  progressBar?.terminate()

/**
 * Get cache directory with fallback logic converted from Go code
 */
function getCacheDirectory(
  isAvoidSystemOnWindows = false
): string {
  const env = process.env.ELECTRON_BUILDER_CACHE?.trim();
  if (env) {
    return env;
  }

  const appName = "electron-builder";

  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Caches", appName);
  }

  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const lowerLocalAppData = localAppData.toLowerCase();
      const username = (process.env.USERNAME || "").toLowerCase();

      if (
        isAvoidSystemOnWindows &&
        (lowerLocalAppData.includes("\\windows\\system32\\") ||
          username === "system")
      ) {
        return path.join(os.tmpdir(), `${appName}-cache`);
      }
      return path.join(localAppData, appName, "Cache");
    }
  }

  const xdgCache = process.env.XDG_CACHE_HOME;
  if (xdgCache) {
    return path.join(xdgCache, appName);
  }

  return path.join(homeDir, ".cache", appName);
}

/**
 * Calculate SHA256 checksum of a file
 */
async function calculateChecksum(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hash = crypto.createHash("sha256");
  hash.update(fileBuffer);
  return hash.digest("hex");
}

/**
 * Downloads, validates, and extracts a binary from GitHub releases
 */
async function _getBinFromUrl(
  releaseName: string,
  filenameWithExt: string,
  checksums: Record<string, string>,
  githubOrgRepo = "electron-userland/electron-builder-binaries"
): Promise<string> {
  const cacheDir = getCacheDirectory();

  const downloadDir = path.join(cacheDir, githubOrgRepo, releaseName);
  const extractDir = path.join(
    downloadDir,
    filenameWithExt.replace(/\.(tar\.gz|tgz)$/, "")
  );
  const downloadedFile = path.join(downloadDir, filenameWithExt);
  const lockFilePath = path.join(downloadDir, `${filenameWithExt}.lock`);

  // Ensure download directory exists before trying to lock
  await fs.mkdir(downloadDir, { recursive: true });

  // Create a lock file to ensure only one process downloads at a time
  // We need to create the lock file first if it doesn't exist
  try {
    await fs.writeFile(lockFilePath, "", { flag: "wx" });
  } catch {
    // File already exists, that's fine
  }

  // Acquire the lock
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(lockFilePath, {
      retries: {
        retries: 60,
        minTimeout: 1000,
        maxTimeout: 5000,
      },
      stale: 60000, // Consider lock stale after 60 seconds
    });

    try {
      await fs.access(extractDir);
      return extractDir;
    } catch {
      // Not extracted yet, continue
    }

    // let needsDownload = true;
    // try {
    //   await fs.access(downloadedFile);
    //   const fileChecksum = await calculateChecksum(downloadedFile);
    //   if (fileChecksum === checksum) {
    //     needsDownload = false;
    //   } else {
    //     // Invalid checksum, delete and re-download
    //     await fs.unlink(downloadedFile);
    //   }
    // } catch {
    //   // File doesn't exist, needs download
    // }

    // if (needsDownload) {
      const details: ElectronDownloadRequest = {
        version: "0.0.0",
        artifactName: filenameWithExt,
      };

      const options: ElectronDownloadRequestOptions = {
        cacheRoot: downloadDir,
        force: process.env.ELECTRON_BUILDER_NO_CACHE === "true",
        downloadOptions: {

        },
        checksums,
        mirrorOptions: {
          mirror: `https://github.com/${githubOrgRepo}/releases/download`,
          customDir: releaseName,
          customFilename: filenameWithExt,
        }
      }
      const downloadedFile = await get.downloadArtifact({
        ...details,
        ...options,
        isGeneric: true,
      })

      // Move temp file to final location (or rename if @electron/get placed it elsewhere)
      // try {
      //   await fs.rename(tempFile, downloadedFile);
      // } catch {
      //   // If temp file doesn't exist, assume @electron/get placed it correctly
      // }

      // Validate checksum
      // const fileChecksum = await calculateChecksum(downloadedFile);
      // if (fileChecksum !== checksums[filenameWithExt]) {
      //   await fs.unlink(downloadedFile);
      //   throw new Error(
      //     `Checksum mismatch for ${filenameWithExt}. Expected: ${checksums[filenameWithExt]}, got: ${fileChecksum}`
      //   );
      // }
    // }

    // Extract the tar.gz file
    await fs.mkdir(extractDir, { recursive: true });
    await tar.extract({
      file: downloadedFile,
      cwd: extractDir,
      strip: 1, // Strip the top-level directory from the archive
    });

    return extractDir;
  } finally {
    // Release the lock
    if (release) {
      await release();
    }
  }
}

// Example usage:
// const binPath = await getBinFromUrl(
//   "dmg-builder%401.1.0",
//   "dmg-builder-v1.1.0-darwin-arm64.tar.gz",
//   "your-sha256-checksum-here",
//   "mmaietta/electron-builder-binaries"
// );

export function getDmgToolsPath() {
  const version = "1.6.7"
  const arch = process.arch === "arm64" ? "arm64" : "x86_64"
  const config = {
    arm64: "egyeVf8nTykmLn08I2Znpvjw3E8FJEvNEVgk5650CfJYD00ffp9MMFb4hawd2c6DFgDRI2cfwdZIDdBIC2S/Ig==",
    x86_64: "bwLvCljFyIPVUH7Z/bjlSwO/tac1rO5AXcQKHrYRbSpg5GtZ1kZ0ZEibCf+PM0PnnA8+YpUxU6ZgLW/raeoKYA==",
  }
  const tarFile = getBinFromUrl("dmg-builder@1.1.0", `dmgbuild-bundle-${arch}-${version}.tar.gz`, config[arch], "mmaietta/electron-builder-binaries")

  tar.
}

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  // It's just easier to copy the map of checksums here rather then adding them to within each if-statement. Also, easy copy-paste from the releases page
  const fpmChecksumMap = {
    "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "0n3BG/Xz1T5YIsoNNTG1bBege9E8A7rym5e3mfzHSHbiSiTS44v6GIHW4amDQk1Y5dtKtWXVq7FwjdmAf3kmMg==",
    "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "wPX3UheBznIlAXduM22W/d27i+DZVIB/MYnY5eh/qLeEEASZqHJWgN+pIckz3jT0dP37g1SQCikXXfsgxtMSPA==",
    "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "7miGWr6dfJSzXDD9ALqkwxvGACp7s7GR50NPcU0YwzbJL825H1SLwGJSGME+v57BxDI2xac47gFEkRZf5u9EtA==",
    "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "moRNjg6Q2iSXpkrm5sGNL2F6KilGNPagbefxhtr3VEqvAUSg2k2pMLr5xXUo0L4rZ4V+uETbwmbDCpeO3pmLyQ==",
    "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "UPzsXhkW2T7+oHSKgFsZsFUxxmPC9lNZHsQbT+OeoTbIGsb6+qf3m7c6uP0XvRFnJiu3MM3lE1xAWQOctvajWA==",
  }

  if (process.env.CUSTOM_FPM_PATH != null) {
    return path.resolve(process.env.CUSTOM_FPM_PATH)
  }
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
  }
  const getKey = () => {
    if (process.platform === "linux") {
      if (process.arch == "x64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z"
      } else if (process.arch === "arm64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z"
      }
      return "fpm-1.17.0-ruby-3.4.3-linux-i386.7z"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z"
    }
    return "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z"
  }

  const filename = getKey()
  const fpmPath = await getBinFromUrl("fpm@2.1.4", filename, fpmChecksumMap[filename])
  return path.join(fpmPath, exec)
}
