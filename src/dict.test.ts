import { Buffer } from 'buffer'
import { expect, it } from 'vitest'

// @ts-ignore
import { compress, decompress } from '../index'
// @ts-ignore
import { decompress as jsDecompress } from '../js'
import { DICTIONARY_BASE64, DICT_COMPRESSED_BASE64, EXPECTED } from './__test__/dictionary'

const dictionary = new Uint8Array(Buffer.from(DICTIONARY_BASE64, 'base64'))
const compressed = new Uint8Array(Buffer.from(DICT_COMPRESSED_BASE64, 'base64'))

it('Compresses with a custom dictionary and round-trips (WASM)', async () => {
  const payload = new TextEncoder().encode(EXPECTED)
  const compressedWithDict = await compress(payload, { quality: 11, customDictionary: dictionary })
  const decompressed = await decompress(compressedWithDict, { customDictionary: dictionary })
  expect(Buffer.from(decompressed).toString()).toStrictEqual(EXPECTED)
})

it('Custom dictionary measurably shrinks the output', async () => {
  // payload that is fully covered by the dictionary, with no self-similarity
  const payload = new TextEncoder().encode('function const return interface string number boolean')
  const withDict = await compress(payload, { quality: 11, customDictionary: dictionary })
  const withoutDict = await compress(payload, { quality: 11 })
  expect(withDict.byteLength).toBeLessThan(withoutDict.byteLength)
})

it('Decompresses data that was compressed with a custom dictionary (JS decoder)', () => {
  const decompressed = jsDecompress(compressed, { customDictionary: dictionary })
  expect(Buffer.from(decompressed).toString()).toStrictEqual(EXPECTED)
})

it('Decompresses reference-CLI dictionary data (main entry)', async () => {
  const decompressed = await decompress(compressed, { customDictionary: dictionary })
  expect(Buffer.from(decompressed).toString()).toStrictEqual(EXPECTED)
})

it('Decompresses WASM dictionary output with the JS decoder (interop)', async () => {
  const payload = new TextEncoder().encode(EXPECTED)
  const compressedWithDict = await compress(payload, { quality: 11, customDictionary: dictionary })
  const decompressed = jsDecompress(compressedWithDict, { customDictionary: dictionary })
  expect(Buffer.from(decompressed).toString()).toStrictEqual(EXPECTED)
})

it('Fails to decompress dictionary-compressed data without the dictionary', () => {
  let threw = false
  try {
    jsDecompress(compressed)
  } catch {
    threw = true
  }
  expect(threw).toBe(true)
})
