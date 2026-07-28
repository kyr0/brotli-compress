import { Buffer } from 'buffer'
import { expect, it } from 'vitest'

// @ts-ignore
import { compress } from '../index'
// @ts-ignore
import { decompress } from '../js'
import { TEST_INPUT } from './__test__/input'

it('Decompress a previously compressed string with handwritten JS based decompressor', async () => {
  const testInput = Buffer.from(TEST_INPUT)
  const compressed = await compress(testInput)
  console.log(
    `Compressed to ${((compressed.byteLength / testInput.byteLength) * 100).toFixed(1)}% of the original ` +
      `(${testInput.byteLength} -> ${compressed.byteLength} bytes)`,
  )
  expect(Buffer.from(decompress(compressed)).toString()).toStrictEqual(TEST_INPUT)
})
