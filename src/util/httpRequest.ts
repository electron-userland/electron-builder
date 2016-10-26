import { Socket } from "net"
import { IncomingMessage, ClientRequest, Agent } from "http"
import * as https from "https"
import { createWriteStream, ensureDir, readFile } from "fs-extra-p"
import { parse as parseUrl } from "url"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { createHash } from "crypto"
import { Transform } from "stream"
import { homedir } from "os"
import { parse as parseIni } from "ini"

const maxRedirects = 10

export interface DownloadOptions {
  skipDirCreation?: boolean
  sha2?: string
}

let httpsAgent: Promise<Agent> | null = null

export function download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
  return <BluebirdPromise<string>>(httpsAgent || (httpsAgent = createAgent()))
    .then(it => new BluebirdPromise(function (resolve, reject) {
      doDownload(url, destination, 0, options || {}, it, error => {
        if (error == null) {
          resolve(destination)
        }
        else {
          reject(error)
        }
      })
    }))
}

export function addTimeOutHandler(request: ClientRequest, callback: (error: Error) => void) {
  request.on("socket", function (socket: Socket) {
    socket.setTimeout(60 * 1000, () => {
      callback(new Error("Request timed out"))
      request.abort()
    })
  })
}

function doDownload(url: string, destination: string, redirectCount: number, options: DownloadOptions, agent: Agent, callback: (error: Error | null) => void) {
  const ensureDirPromise = options.skipDirCreation ? BluebirdPromise.resolve() : ensureDir(path.dirname(destination))

  const parsedUrl = parseUrl(url)
  // user-agent must be specified, otherwise some host can return 401 unauthorised
  const request = https.request({
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    headers: {
      "User-Agent": "electron-builder"
    },
    agent: agent,
  }, (response: IncomingMessage) => {
    if (response.statusCode >= 400) {
      callback(new Error(`Cannot download "${url}", status ${response.statusCode}: ${response.statusMessage}`))
      return
    }

    const redirectUrl = response.headers.location
    if (redirectUrl != null) {
      if (redirectCount < maxRedirects) {
        doDownload(redirectUrl, destination, redirectCount++, options, agent, callback)
      }
      else {
        callback(new Error("Too many redirects (> " + maxRedirects + ")"))
      }
      return
    }

    const sha2Header = response.headers["X-Checksum-Sha2"]
    if (sha2Header != null && options.sha2 != null) {
      // todo why bintray doesn't send this header always
      if (sha2Header == null) {
        throw new Error("checksum is required, but server response doesn't contain X-Checksum-Sha2 header")
      }
      else if (sha2Header !== options.sha2) {
        throw new Error(`checksum mismatch: expected ${options.sha2} but got ${sha2Header} (X-Checksum-Sha2 header)`)
      }
    }

    ensureDirPromise
      .then(() => {
        const fileOut = createWriteStream(destination)
        if (options.sha2 == null) {
          response.pipe(fileOut)
        }
        else {
          response
            .pipe(new DigestTransform(options.sha2))
            .pipe(fileOut)
        }

        fileOut.on("finish", () => (<any>fileOut.close)(callback))
      })
      .catch(callback)

    let ended = false
    response.on("end", () => {
      ended = true
    })

    response.on("close", () => {
      if (!ended) {
        callback(new Error("Request aborted"))
      }
    })
  })
  addTimeOutHandler(request, callback)
  request.on("error", callback)
  request.end()
}

class DigestTransform extends Transform {
  readonly digester = createHash("sha256")

  constructor(private expected: string) {
   super()
  }

  _transform(chunk: any, encoding: string, callback: Function) {
    this.digester.update(chunk)
    callback(null, chunk)
  }

  _flush(callback: Function): void {
    const hash = this.digester.digest("hex")
    callback(hash === this.expected ? null : new Error(`SHA2 checksum mismatch, expected ${this.expected}, got ${hash}`))
  }
}

// only https proxy
async function proxyFromNpm() {
  let data = ""
  try {
    data = await readFile(path.join(homedir(), ".npmrc"), "utf-8")
  }
  catch (ignored) {
    return null
  }

  if (!data) {
    return null
  }

  try {
    const config = parseIni(data)
    return config["https-proxy"] || config.proxy
  }
  catch (e) {
    // used in nsis auto-updater, do not use .util.warn here
    console.warn(e)
    return null
  }
}

// only https url
async function createAgent() {
  let proxyString: string =
    process.env.npm_config_https_proxy ||
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.npm_config_proxy

  if (!proxyString) {
    proxyString = await proxyFromNpm()
    if (!proxyString) {
      return null
    }
  }

  const proxy = parseUrl(proxyString)

  const proxyProtocol = proxy.protocol === "https:" ? "Https" : "Http"
  return require("tunnel-agent")[`httpsOver${proxyProtocol}`]({
    proxy: {
      port: proxy.port || (proxyProtocol === "Https" ? 443 : 80),
      host: proxy.hostname,
      proxyAuth: proxy.auth
    }
  })
}