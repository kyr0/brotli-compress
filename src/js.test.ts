import { Buffer } from 'buffer'

// @ts-ignore
import { compress } from '../index'
// @ts-ignore
import { decompress } from '../js'

it('Decompress a previously compressed string with handwritten JS based decompressor', async () => {
  const testInput = 'Hello🤖!'
  const compressed = await compress(Buffer.from(testInput))
  expect(Buffer.from(decompress(compressed)).toString()).toStrictEqual(testInput)
})
