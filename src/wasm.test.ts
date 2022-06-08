import { Buffer } from 'buffer'
import { TEST_INPUT } from './__test__/input'

// @ts-ignore
import { compress, decompress } from '../index'

it('Compresses and decompresses a string', async () => {
  const testInput = Buffer.from(TEST_INPUT)
  const compressed = await compress(testInput)
  console.log('Compression rate:', (testInput.byteLength / compressed.byteLength) * 100, '%')
  const decompressed = await decompress(compressed)
  expect(Buffer.from(decompressed).toString()).toStrictEqual(TEST_INPUT)
})
