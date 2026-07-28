// Golden `.br` corpus verification.
//
// For every fixture in src/__test__/fixtures/manifest.json this asserts three
// binary-stable invariants, so that bumping the upstream WASM package (or
// touching either decoder) is caught immediately:
//   1. WASM recompress(source, config) reproduces the pinned `.br` bytes exactly
//      (compress determinism / stability).
//   2. WASM decode(`.br`, config) matches the original source bytes.
//   3. pure-JS decode(`.br`, config) matches the original source bytes
//      (decoder interop: a WASM-compressed stream must decode identically in JS).
//
// This test is also re-run by the release gate (phase D) against BOTH the latest
// published and the upcoming installed tarball — so the corpus guards releases,
// not just local development.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'buffer'
import { expect, it } from 'vitest'

// @ts-ignore
import { compress, decompress } from '../index'
// @ts-ignore
import { decompress as jsDecompress } from '../js'
import { INPUTS, DICTIONARIES, type Source } from './__test__/fixtures/sources'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(HERE, '__test__', 'fixtures')

interface FixtureConfig {
  file: string
  input: string
  quality: number
  dictionary: string | null
  inputBytes: number
  compressedBytes: number
}

const manifest = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'manifest.json'), 'utf-8')).configs as FixtureConfig[]

const lookup = (arr: Source[], name: string): Uint8Array => {
  const s = arr.find((x) => x.name === name)
  if (!s) throw new Error(`unknown source: ${name}`)
  return s.bytes
}

const readFixture = (file: string) => new Uint8Array(readFileSync(path.join(FIXTURES_DIR, file)))
const encodeOpts = (c: FixtureConfig) => ({
  quality: c.quality,
  ...(c.dictionary ? { customDictionary: lookup(DICTIONARIES, c.dictionary) } : {}),
})
const decodeOpts = (c: FixtureConfig) => (c.dictionary ? { customDictionary: lookup(DICTIONARIES, c.dictionary) } : undefined)

// sanity: the corpus actually exists and is non-empty
it('golden fixture corpus is present and non-empty', () => {
  expect(manifest.length).toBeGreaterThan(30)
})

it.each(manifest)('compress-stable: $file — WASM recompress reproduces the pinned .br bytes', async (c) => {
  const input = lookup(INPUTS, c.input)
  const recompressed = await compress(input, encodeOpts(c))
  const pinned = readFixture(c.file)
  expect(recompressed.byteLength).toBe(pinned.byteLength)
  expect(Buffer.from(recompressed).equals(Buffer.from(pinned))).toBe(true)
})

it.each(manifest)('decode-wasm: $file — WASM decode matches the original source', async (c) => {
  const out = await decompress(readFixture(c.file), decodeOpts(c))
  expect(Buffer.from(out).equals(Buffer.from(lookup(INPUTS, c.input)))).toBe(true)
})

it.each(manifest)('decode-js: $file — pure-JS decode matches the original source', (c) => {
  const out = jsDecompress(readFixture(c.file), decodeOpts(c))
  expect(Buffer.from(out).equals(Buffer.from(lookup(INPUTS, c.input)))).toBe(true)
})
