// @ts-ignore
import { compress, decompress } from '../index'

it('Compresses and decompresses a string', async () => {
  const oneBlockInput = 'Hello🤖!'
  const compressed = await compress(oneBlockInput)
  const decompressed = await decompress(compressed)
  expect(decompressed.toString()).toStrictEqual(oneBlockInput)
})
