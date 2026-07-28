// Named input payloads and dictionaries used to generate the golden `.br`
// fixture corpus (see scripts/generate-fixtures.ts) and to verify it
// (see src/fixtures.test.ts). Keeping the sources in one place means the
// generator and the test agree on exactly what bytes each fixture represents.
//
// The corpus pins compress + decompress output for many configurations so that
// bumping the upstream WASM package (or touching either decoder) is caught at
// the binary level — guaranteeing the SECURITY.md "no behaviour change" promise.

import { TEST_INPUT } from '../input'
import { EXPECTED, DICTIONARY_BASE64, REPEATED_DICTIONARY_BASE } from '../dictionary'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

// atob-based base64 decode (isomorphic: Node + browsers, no Buffer dependency)
const fromB64 = (b64: string): Uint8Array => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface Source {
  name: string
  bytes: Uint8Array
}

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod ' +
  'tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, ' +
  'quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo ' +
  'consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse ' +
  'cillum dolore eu fugiat nulla pariatur.'

const JSON_SAMPLE = JSON.stringify(
  {
    name: 'brotli-compress',
    version: '2.2.2',
    keywords: ['brotli', 'wasm', 'compress', 'decompress'],
    config: { quality: 11, window: null, dictionary: 'ts-keywords' },
    nested: { a: 1, b: [true, false, null], c: { deep: 'value' } },
  },
  null,
  2,
)

const HTML_SAMPLE =
  '<!doctype html><html><head><title>Sample</title></head>' +
  '<body><h1>Hello</h1><p>A sample HTML document for compression testing.</p>' +
  '<ul><li>one</li><li>two</li><li>three</li></ul></body></html>'

// pseudo-random binary payload (deterministic: no Math.random)
const BINARY_SAMPLE = (() => {
  const u = new Uint8Array(512)
  for (let i = 0; i < u.length; i++) u[i] = (i * 37 + 11) & 0xff
  return u
})()

// large, self-similar payload (compresses very well) — derived from EXPECTED
const LARGE_REPETITIVE = (() => {
  const base = enc(EXPECTED)
  const repeats = 64
  const u = new Uint8Array(base.length * repeats)
  for (let i = 0; i < repeats; i++) u.set(base, i * base.length)
  return u
})()

export const INPUTS: Source[] = [
  { name: 'empty', bytes: new Uint8Array(0) },
  { name: 'single', bytes: enc('A') },
  { name: 'hello', bytes: enc('Hello🤖!') }, // multi-byte UTF-8
  { name: 'text-en', bytes: enc(LOREM) },
  { name: 'json', bytes: enc(JSON_SAMPLE) },
  { name: 'html', bytes: enc(HTML_SAMPLE) },
  { name: 'ts-code', bytes: enc(EXPECTED) },
  { name: 'assembly', bytes: enc(TEST_INPUT) },
  { name: 'binary', bytes: BINARY_SAMPLE },
  { name: 'large-repetitive', bytes: LARGE_REPETITIVE },
]

export const DICTIONARIES: Source[] = [
  { name: 'ts-keywords', bytes: fromB64(DICTIONARY_BASE64) },
  {
    // the REPEATED_DICTIONARY_BASE sequence repeated 256x (mirrors dict.test.ts)
    name: 'repeated-ts',
    bytes: (() => {
      const base = enc(REPEATED_DICTIONARY_BASE)
      const u = new Uint8Array(base.length * 256)
      for (let i = 0; i < 256; i++) u.set(base, i * base.length)
      return u
    })(),
  },
]
