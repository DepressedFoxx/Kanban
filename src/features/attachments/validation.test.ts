import { it, expect } from 'vitest'
import {
  validateFile,
  readBounded,
  MAX_BYTES,
} from '../../../supabase/functions/task-files/validation'
const bytes = (s: string) => new TextEncoder().encode(s)
it('allows Vietnamese UTF8 text but rejects active markup, binary, MIME spoof and unsafe names', () => {
  expect(validateFile('ghi-chú.txt', bytes('Nội dung công việc'))).toBe(
    'text/plain',
  )
  for (const [name, data] of [
    ['x.png', 'not png'],
    ['x.txt', '<svg onload=alert(1)>'],
    ['x.svg', '<svg/>'],
    ['../x.txt', 'text'],
    ['x.txt', 'a\x00b'],
    ['x.pdf', '%PDF-1.4 fake'],
  ] as const)
    expect(() => validateFile(name, bytes(data))).toThrow()
  expect(() => validateFile('x.txt', new Uint8Array([255, 254]))).toThrow()
})
it('checks PNG chunk integrity and rejects appended content', () => {
  const png = new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  // A generated PNG with valid chunk CRC is accepted; corrupt payload is rejected.
  const good = new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  expect(validateFile('image.png', good)).toBe('image/png')
  good[good.length - 1] = good[good.length - 1]! ^ 1
  expect(() => validateFile('image.png', good)).toThrow()
  expect(() =>
    validateFile('image.png', new Uint8Array([...png, ...bytes('<script>')])),
  ).toThrow()
})
it('enforces actual streamed size even without Content-Length', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    body: new Uint8Array(MAX_BYTES + 1),
  })
  await expect(readBounded(request)).rejects.toThrow('FILE_TOO_LARGE')
  await expect(
    readBounded(
      new Request('https://example.test', { method: 'POST', body: '' }),
    ),
  ).rejects.toThrow('EMPTY_FILE')
})
