import { Buffer } from 'buffer'
import { expect, it } from 'vitest'

// @ts-ignore
import { compress, decompress } from '../index.external.mjs'
import { TEST_INPUT } from './__test__/input'

it('Compresses and decompresses a string (external wasm build)', async () => {
  const testInput = Buffer.from(TEST_INPUT)
  const compressed = await compress(testInput)
  const decompressed = await decompress(compressed)
  expect(Buffer.from(decompressed).toString()).toStrictEqual(TEST_INPUT)
})
