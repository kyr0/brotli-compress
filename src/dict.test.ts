import { Buffer } from 'buffer'
import { expect, it } from 'vitest'

// @ts-ignore
import { compress, decompress } from '../index'
// @ts-ignore
import { decompress as jsDecompress } from '../js'
import { DICTIONARY_BASE64, DICT_COMPRESSED_BASE64, EXPECTED } from './__test__/dictionary'
import {
  REPEATED_DICTIONARY_BASE,
  REPEATED_DICT_COMPRESSED_BASE64,
  REPEATED_DICT_EXPECTED_BASE64,
} from './__test__/dictionary'

const dictionary = new Uint8Array(Buffer.from(DICTIONARY_BASE64, 'base64'))
const compressed = new Uint8Array(Buffer.from(DICT_COMPRESSED_BASE64, 'base64'))

const repeatedDictionary = (() => {
  const base = new TextEncoder().encode(REPEATED_DICTIONARY_BASE)
  const dict = new Uint8Array(base.length * 256)
  for (let i = 0; i < 256; i++) dict.set(base, i * base.length)
  return dict
})()
const repeatedDictCompressed = new Uint8Array(Buffer.from(REPEATED_DICT_COMPRESSED_BASE64, 'base64'))
const repeatedDictExpected = new Uint8Array(Buffer.from(REPEATED_DICT_EXPECTED_BASE64, 'base64'))

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

// Regression: dictionary references with distance code 0 ("reuse last
// distance") must not roll the distance ring buffer (RFC 7932 section 4).
// A decoder that rolls it anyway corrupts later short-code distances.
it('JS decoder handles dictionary references with reused distances (repeated dictionary)', () => {
  const decompressed = jsDecompress(repeatedDictCompressed, { customDictionary: repeatedDictionary })
  expect(Buffer.from(decompressed).equals(Buffer.from(repeatedDictExpected))).toBe(true)
})

it('WASM decoder handles dictionary references with reused distances (repeated dictionary)', async () => {
  const decompressed = await decompress(repeatedDictCompressed, { customDictionary: repeatedDictionary })
  expect(Buffer.from(decompressed).equals(Buffer.from(repeatedDictExpected))).toBe(true)
})

it('Round-trips a repeated dictionary across qualities (WASM compress, JS decompress)', async () => {
  const payload = new TextEncoder().encode(EXPECTED.repeat(8))
  for (const quality of [5, 9, 11]) {
    const compressedWithDict = await compress(payload, { quality, customDictionary: repeatedDictionary })
    const decompressed = jsDecompress(compressedWithDict, { customDictionary: repeatedDictionary })
    expect(Buffer.from(decompressed).toString()).toStrictEqual(EXPECTED.repeat(8))
  }
})
