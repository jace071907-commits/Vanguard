// Minimal ZIP reader/writer using the browser's native (De)CompressionStream.
// Enough for editing Office Open XML files (.docx) without third-party libraries.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}
const inflate = (b) => pipe(b, new DecompressionStream('deflate-raw'))
const deflate = (b) => pipe(b, new CompressionStream('deflate-raw'))

const utf8 = new TextEncoder()
const utf8d = new TextDecoder()

/** Reads a ZIP archive into an ordered list of entries. */
export async function readZip(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Invalid ZIP file (end of central directory not found).')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const entries = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Invalid ZIP central directory.')
    const method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true)
    const compSize = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = utf8d.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    const lNameLen = view.getUint16(localOffset + 26, true)
    const lExtraLen = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + lNameLen + lExtraLen
    entries.push({ name, method, crc, compSize, size, raw: bytes.subarray(start, start + compSize) })
    p += 46 + nameLen + extraLen + commentLen
  }
  return new ZipArchive(entries)
}

class ZipArchive {
  constructor(entries) {
    this.entries = entries
  }

  has(name) {
    return this.entries.some((e) => e.name === name)
  }

  async readText(name) {
    const e = this.entries.find((x) => x.name === name)
    if (!e) throw new Error(`Missing ${name} in archive.`)
    const data = e.method === 0 ? e.raw : await inflate(e.raw)
    return utf8d.decode(data)
  }

  writeText(name, text) {
    const e = this.entries.find((x) => x.name === name)
    const entry = { name, data: utf8.encode(text) }
    if (e) Object.assign(e, entry, { raw: null })
    else this.entries.push(entry)
  }

  /** Builds the archive. Modified entries are re-compressed; untouched ones are copied as-is. */
  async toBlob(type = 'application/zip') {
    const chunks = []
    const central = []
    let offset = 0
    for (const e of this.entries) {
      if (!e.raw) {
        e.crc = crc32(e.data)
        e.size = e.data.length
        e.raw = await deflate(e.data)
        e.method = 8
        e.compSize = e.raw.length
      }
      const name = utf8.encode(e.name)
      const local = new DataView(new ArrayBuffer(30))
      local.setUint32(0, 0x04034b50, true)
      local.setUint16(4, 20, true)
      local.setUint16(6, 0x0800, true)
      local.setUint16(8, e.method, true)
      local.setUint16(10, 0, true)
      local.setUint16(12, 0x21, true)
      local.setUint32(14, e.crc, true)
      local.setUint32(18, e.compSize, true)
      local.setUint32(22, e.size, true)
      local.setUint16(26, name.length, true)
      local.setUint16(28, 0, true)
      chunks.push(new Uint8Array(local.buffer), name, e.raw)

      const cd = new DataView(new ArrayBuffer(46))
      cd.setUint32(0, 0x02014b50, true)
      cd.setUint16(4, 20, true)
      cd.setUint16(6, 20, true)
      cd.setUint16(8, 0x0800, true)
      cd.setUint16(10, e.method, true)
      cd.setUint16(12, 0, true)
      cd.setUint16(14, 0x21, true)
      cd.setUint32(16, e.crc, true)
      cd.setUint32(20, e.compSize, true)
      cd.setUint32(24, e.size, true)
      cd.setUint16(28, name.length, true)
      cd.setUint32(42, offset, true)
      central.push(new Uint8Array(cd.buffer), name)
      offset += 30 + name.length + e.raw.length
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, this.entries.length, true)
    end.setUint16(10, this.entries.length, true)
    end.setUint32(12, cdSize, true)
    end.setUint32(16, offset, true)
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type })
  }
}
