export const MAX_BYTES = 10 * 1024 * 1024
export class FileError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code)
  }
}
export async function readBounded(request: Request): Promise<Uint8Array> {
  const size = Number(request.headers.get('content-length') ?? 0)
  if (size > MAX_BYTES) throw new FileError('FILE_TOO_LARGE', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new FileError('EMPTY_FILE')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BYTES) {
        await reader.cancel()
        throw new FileError('FILE_TOO_LARGE', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  if (!length) throw new FileError('EMPTY_FILE')
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
const ascii = (b: Uint8Array) => new TextDecoder('latin1').decode(b)
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function png(b: Uint8Array) {
  if (b.length < 45 || b.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10')
    return false
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let pos = 8,
    header = false,
    data = false
  while (pos + 12 <= b.length) {
    const n = view.getUint32(pos),
      type = ascii(b.slice(pos + 4, pos + 8))
    if (pos + 12 + n > b.length) return false
    if (crc32(b.slice(pos + 4, pos + 8 + n)) !== view.getUint32(pos + 8 + n))
      return false
    if (!header) {
      if (type !== 'IHDR' || n !== 13) return false
      const w = view.getUint32(pos + 8),
        h = view.getUint32(pos + 12)
      if (!w || !h || w * h > 40000000) return false
      header = true
    }
    if (type === 'IDAT' && n > 0) data = true
    if (type === 'IEND') return data && n === 0 && pos + 12 === b.length
    pos += 12 + n
  }
  return false
}
function jpeg(b: Uint8Array) {
  if (
    b.length < 16 ||
    b[0] !== 255 ||
    b[1] !== 216 ||
    b[b.length - 2] !== 255 ||
    b[b.length - 1] !== 217
  )
    return false
  let p = 2,
    frame = false
  while (p + 4 < b.length) {
    if (b[p++] !== 255) return false
    while (b[p] === 255) p++
    const marker = b[p++]!
    if (marker === 218) return frame && p + 2 < b.length
    const n = (b[p]! << 8) | b[p + 1]!
    if (n < 2 || p + n > b.length) return false
    if ([192, 193, 194].includes(marker)) {
      if (n < 8) return false
      const h = (b[p + 3]! << 8) | b[p + 4]!,
        w = (b[p + 5]! << 8) | b[p + 6]!
      if (!w || !h || w * h > 40000000) return false
      frame = true
    }
    p += n
  }
  return false
}
function webp(b: Uint8Array) {
  if (
    b.length < 30 ||
    ascii(b.slice(0, 4)) !== 'RIFF' ||
    ascii(b.slice(8, 12)) !== 'WEBP'
  )
    return false
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (v.getUint32(4, true) + 8 !== b.length) return false
  let p = 12,
    frame = false
  while (p + 8 <= b.length) {
    const kind = ascii(b.slice(p, p + 4)),
      n = v.getUint32(p + 4, true)
    if (p + 8 + n > b.length) return false
    if (
      kind === 'VP8 ' &&
      n >= 10 &&
      b[p + 11] === 157 &&
      b[p + 12] === 1 &&
      b[p + 13] === 42
    )
      frame = true
    if (kind === 'VP8L' && n >= 5 && b[p + 8] === 47) frame = true
    p += 8 + n + (n % 2)
  }
  return frame && p === b.length
}
/** Structural content checks, not an antivirus. Downloads always use attachment disposition. */
export function validateFile(name: string, bytes: Uint8Array): string {
  if (
    !name ||
    name.length > 180 ||
    /[\\/\u0000-\u001f\u007f]/.test(name) ||
    name.trim() !== name
  )
    throw new FileError('INVALID_FILENAME')
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new FileError('FILE_TOO_LARGE', 413)
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'png' && png(bytes)) return 'image/png'
  if (['jpg', 'jpeg'].includes(ext ?? '') && jpeg(bytes)) return 'image/jpeg'
  if (ext === 'webp' && webp(bytes)) return 'image/webp'
  if (ext === 'pdf') {
    const text = ascii(bytes)
    if (
      /^%PDF-1\.[0-7]|^%PDF-2\.0/.test(text) &&
      /startxref\s+\d+\s+%%EOF\s*$/.test(text) &&
      /\/Type\s*\/Catalog\b/.test(text)
    )
      return 'application/pdf'
  }
  if (ext === 'txt') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) &&
        !/<\s*(?:!doctype\s+html|html|svg|script)\b/i.test(text)
      )
        return 'text/plain'
    } catch {
      /* Invalid UTF-8 is not a text attachment. */
    }
  }
  throw new FileError('UNSUPPORTED_FILE_CONTENT', 415)
}
