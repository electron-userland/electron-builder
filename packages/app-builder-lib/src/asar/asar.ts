import { createFromBuffer } from "chromium-pickle-js"
import { close, open, read, readFile, Stats } from "fs-extra"
import * as path from "path"

/** @internal */
export class Node {
  // we don't use Map because later it will be stringified
  files?: { [key: string]: Node }

  unpacked?: boolean

  size?: number
  // electron expects string
  offset?: string

  executable?: boolean

  link?: string
}

/** @internal */
export class AsarFilesystem {
  private offset = 0

  constructor(readonly src: string, readonly header = new Node(), readonly headerSize: number = -1) {
    if (this.header.files == null) {
      this.header.files = {}
    }
  }

  searchNodeFromDirectory(p: string, isCreate: boolean): Node | null {
    let node = this.header
    for (const dir of p.split(path.sep)) {
      if (dir !== ".") {
        let child = node.files![dir]
        if (child == null) {
          if (!isCreate) {
            return null
          }
          child = new Node()
          child.files = {}
          node.files![dir] = child
        }
        node = child
      }
    }
    return node
  }

  getOrCreateNode(p: string): Node {
    if (p == null || p.length === 0) {
      return this.header
    }

    const name = path.basename(p)
    const dirNode = this.searchNodeFromDirectory(path.dirname(p), true)!
    if (dirNode.files == null) {
      dirNode.files = {}
    }

    let result = dirNode.files[name]
    if (result == null) {
      result = new Node()
      dirNode.files[name] = result
    }
    return result
  }

  addFileNode(file: string, dirNode: Node, size: number, unpacked: boolean, stat: Stats): Node {
    if (size > 4294967295) {
      throw new Error(`${file}: file size cannot be larger than 4.2GB`)
    }

    const node = new Node()
    node.size = size
    if (unpacked) {
      node.unpacked = true
    }
    else {
      // electron expects string
      node.offset = this.offset.toString()
      if (process.platform !== "win32" && (stat.mode & 0o100)) {
        node.executable = true
      }
      this.offset += node.size
    }

    let children = dirNode.files
    if (children == null) {
      children = {}
      dirNode.files = children
    }
    children[path.basename(file)] = node

    return node
  }

  getNode(p: string): Node | null {
    const node = this.searchNodeFromDirectory(path.dirname(p), false)!!
    return node.files!![path.basename(p)]
  }

  getFile(p: string, followLinks: boolean = true): Node {
    const info = this.getNode(p)!
    // if followLinks is false we don't resolve symlinks
    return followLinks && info.link != null ? this.getFile(info.link) : info
  }

  async readJson(file: string): Promise<any> {
    return JSON.parse((await this.readFile(file)).toString())
  }

  readFile(file: string): Promise<Buffer> {
    return readFileFromAsar(this, file, this.getFile(file))
  }
}

export async function readAsar(archive: string): Promise<AsarFilesystem> {
  const fd = await open(archive, "r")
  let size: number
  let headerBuf
  try {
    const sizeBuf = Buffer.allocUnsafe(8)
    if ((await read(fd, sizeBuf, 0, 8, null as any)).bytesRead !== 8) {
      throw new Error("Unable to read header size")
    }

    const sizePickle = createFromBuffer(sizeBuf)
    size = sizePickle.createIterator().readUInt32()
    headerBuf = Buffer.allocUnsafe(size)
    if ((await read(fd, headerBuf, 0, size, null as any)).bytesRead !== size) {
      throw new Error("Unable to read header")
    }
  }
  finally {
    await close(fd)
  }

  const headerPickle = createFromBuffer(headerBuf!)
  const header = headerPickle.createIterator().readString()
  return new AsarFilesystem(archive, JSON.parse(header), size)
}

export async function readAsarJson(archive: string, file: string): Promise<any> {
  const fs = await readAsar(archive)
  return await fs.readJson(file)
}

async function readFileFromAsar(filesystem: AsarFilesystem, filename: string, info: Node): Promise<Buffer> {
  const size = info.size!!
  const buffer = Buffer.allocUnsafe(size)
  if (size <= 0) {
    return buffer
  }

  if (info.unpacked) {
    return await readFile(path.join(`${filesystem.src}.unpacked`, filename))
  }

  const fd = await open(filesystem.src, "r")
  try {
    const offset = 8 + filesystem.headerSize + parseInt(info.offset!!, 10)
    await read(fd, buffer, 0, size, offset)
  }
  finally {
    await close(fd)
  }
  return buffer
}
