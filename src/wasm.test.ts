import { Buffer } from 'buffer'

// @ts-ignore
import { compress, decompress } from '../index'

it('Compresses and decompresses a string', async () => {
  const testInput = 'Hello🤖!'
  const compressed = await compress(Buffer.from(testInput))
  const decompressed = await decompress(compressed)
  expect(Buffer.from(decompressed).toString()).toStrictEqual(testInput)
})
