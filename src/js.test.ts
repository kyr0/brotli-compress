import { Buffer } from 'buffer'

// @ts-ignore
import { compress } from '../index'
// @ts-ignore
import { decompress } from '../js'
import { TEST_INPUT } from './__test__/input'

it('Decompress a previously compressed string with handwritten JS based decompressor', async () => {
  const testInput = Buffer.from(TEST_INPUT)
  const compressed = await compress(testInput)
  console.log('Compression rate:', (testInput.byteLength / compressed.byteLength) * 100, '%')
  expect(Buffer.from(decompress(compressed)).toString()).toStrictEqual(TEST_INPUT)
})
