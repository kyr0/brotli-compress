import { Buffer } from 'buffer'
import { expect, it } from 'vitest'
import { TEST_INPUT, PLAIN_COMPRESSED_BASE64 } from './__test__/input'

// @ts-ignore
import { compress, decompress } from '../index'

it('Compresses and decompresses a string', async () => {
  const testInput = Buffer.from(TEST_INPUT)
  const compressed = await compress(testInput)
  console.log(
    `Compressed to ${((compressed.byteLength / testInput.byteLength) * 100).toFixed(1)}% of the original ` +
      `(${testInput.byteLength} -> ${compressed.byteLength} bytes)`,
  )
  const decompressed = await decompress(compressed)
  expect(Buffer.from(decompressed).toString()).toStrictEqual(TEST_INPUT)
})

// Guards the SECURITY.md promise: the default-config (quality 11) compressed
// form of TEST_INPUT is a byte-stable golden that the release-parity gate pins
// across versions. If compress(encode(TEST_INPUT)) ever drifts, this fails in
// `npm test` immediately — not only at release time. See PLAIN_COMPRESSED_BASE64.
it('Default-config compression reproduces the pinned golden output', async () => {
  const testInput = new TextEncoder().encode(TEST_INPUT)
  const compressed = await compress(testInput)
  expect(Buffer.from(compressed).toString('base64')).toStrictEqual(PLAIN_COMPRESSED_BASE64)
})

it('Decodes the pinned golden compressed blob back to TEST_INPUT', async () => {
  const golden = new Uint8Array(Buffer.from(PLAIN_COMPRESSED_BASE64, 'base64'))
  const decompressed = await decompress(golden)
  expect(Buffer.from(decompressed).toString()).toStrictEqual(TEST_INPUT)
})
