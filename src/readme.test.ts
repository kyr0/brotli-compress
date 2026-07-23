import { expect, it } from 'vitest'

// @ts-ignore
import { compress, decompress } from '../index.mjs'
// @ts-ignore
import { decompress as jsDecompress } from '../js.mjs'

const oneBlockInput = 'Hello🤖!'

// mirrors the README example verbatim (multi-byte UTF-8 input matters here)
it('Compresses and decompresses an UTF-8 string as documented in the README', async () => {
  const textEncoder = new TextEncoder()

  // it takes a Uint8Array and returns a Uint8Array
  const compressed = await compress(textEncoder.encode(oneBlockInput))

  // it takes a Uint8Array and returns a Uint8Array
  const decompressed = await decompress(compressed)
  const decompressedString = new TextDecoder().decode(decompressed)

  expect(decompressedString).toStrictEqual(oneBlockInput)
})

// mirrors the README's "Usage of the WASM variant" (inlined ESM build)
it('Round-trips through the inlined ESM build (index.mjs)', async () => {
  const compressed = await compress(new TextEncoder().encode(oneBlockInput))
  const decompressed = await decompress(compressed)
  expect(new TextDecoder().decode(decompressed)).toStrictEqual(oneBlockInput)
})

// mirrors the README's "Usage of the pure JS variant":
// synchronous, decompress-only, Uint8Array in / Uint8Array out
it('Decompresses with the pure JS variant as documented in the README', async () => {
  const compressed = await compress(new TextEncoder().encode(oneBlockInput))

  // the pure JS variant is synchronous
  const decompressed = jsDecompress(compressed)

  expect(new TextDecoder().decode(decompressed)).toStrictEqual(oneBlockInput)
})

// the API takes Uint8Array input only (see @thdoan's issue) — fail loudly
// instead of silently compressing garbage (see @lawruble13's repro, which
// passed a plain object)
it('Fails loudly when called with a non-Uint8Array input', async () => {
  // @ts-ignore
  await expect(compress(oneBlockInput)).rejects.toThrow(TypeError)
  // @ts-ignore
  await expect(compress({ foo: 'bar' })).rejects.toThrow(TypeError)
  // @ts-ignore
  await expect(decompress('not binary')).rejects.toThrow(TypeError)
})
