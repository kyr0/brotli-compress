/**
 * Canonical list of "known configurations" for compress/decompress that define
 * the release-parity byte contract (see SECURITY.md).
 *
 * Every vector mirrors a configuration already exercised by the repo's own
 * test suite (src/*.test.ts). The release gate runs each vector against BOTH
 * the latest published and the upcoming release and asserts byte-identical
 * output (see ./parity-probe.ts and ./release-gate.ts).
 *
 * WHY this exists: SECURITY.md promises "nothing is ever removed or behaviour
 * changed". New options and new functions may be added freely, but the default
 * and every previously-tested configuration MUST keep producing the exact same
 * bytes. Adding a vector here widens the contract; the gate then enforces it
 * forever after, so the contract only ever grows — it can never silently shrink.
 *
 * This module is deliberately decoupled from the on-disk fixture location: it
 * receives all fixture data via `buildVectors(fixtures)` so the same code runs
 * unchanged both inside the repo (unit tests) and inside an isolated scratch
 * consumer that has the package installed and a copy of the fixtures.
 */

/** Loose API surface a vector receives. Intentionally permissive so the probe
 *  keeps working across past/future builds without choking on type drift. */
export type ParityApi = {
  compress?: (input: Uint8Array, options?: Record<string, unknown>) => Promise<Uint8Array>
  decompress?: (input: Uint8Array, options?: Record<string, unknown>) => Promise<Uint8Array> | Uint8Array
  createCompressStream?: (options?: Record<string, unknown>) => Promise<StreamApi>
  createDecompressStream?: (options?: Record<string, unknown>) => Promise<StreamApi>
  BrotliStreamResultCode?: Record<string, number>
}

export type StreamApi = {
  compress: (chunk: Uint8Array | null, outputSize: number) => StreamResult
  decompress: (chunk: Uint8Array, outputSize: number) => StreamResult
  free: () => void
}

export type StreamResult = { code: number; buf: Uint8Array; input_offset: number }

/** Which package entry point a configuration targets. */
export type EntryPoint = 'main' | 'js' | 'external'

export interface ParityVector {
  /** Stable fingerprint key — never rename an id (renaming silently drops a guard). */
  id: string
  /** Which test/scenario this configuration mirrors, for the human-readable report. */
  origin: string
  /** Package entry point the configuration runs against. */
  entry: EntryPoint
  /** Produces the output bytes for this configuration given the entry's API. */
  run: (api: ParityApi) => Promise<Uint8Array>
}

/** All baked fixture data the vectors depend on. */
export interface ParityFixtures {
  TEST_INPUT: string
  PLAIN_COMPRESSED_BASE64: string
  DICTIONARY_BASE64: string
  DICT_COMPRESSED_BASE64: string
  EXPECTED: string
  REPEATED_DICTIONARY_BASE: string
  REPEATED_DICT_COMPRESSED_BASE64: string
  REPEATED_DICT_EXPECTED_BASE64: string
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

// atob-based base64 decode so this module stays runtime-portable (no Buffer).
const fromB64 = (b64: string): Uint8Array => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

// Faithful port of streamCompress() from src/stream.test.ts: feeds `input`
// through a CompressStream in `chunkSize` slices with a deliberately tiny
// `outputSize` so the NeedsMoreOutput path is exercised, then finalizes.
const streamCompress = async (
  api: ParityApi,
  input: Uint8Array,
  chunkSize: number,
  outputSize: number,
  options?: Record<string, unknown>,
): Promise<Uint8Array> => {
  const stream = await api.createCompressStream!(options)
  const codes = api.BrotliStreamResultCode!
  const out: Uint8Array[] = []
  let offset = 0
  while (offset < input.byteLength) {
    const res = stream.compress(input.subarray(offset, offset + chunkSize), outputSize)
    out.push(res.buf)
    if (res.code === codes.NeedsMoreOutput) {
      offset += res.input_offset
    } else {
      offset += chunkSize - (input.subarray(offset, offset + chunkSize).byteLength - res.input_offset)
    }
  }
  // finalize until the encoder reports success
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = stream.compress(null, outputSize)
    out.push(res.buf)
    if (res.code === codes.ResultSuccess) break
  }
  stream.free()
  return concat(out)
}

// Faithful port of streamDecompress() from src/stream.test.ts.
const streamDecompress = async (
  api: ParityApi,
  input: Uint8Array,
  chunkSize: number,
  outputSize: number,
  options?: Record<string, unknown>,
): Promise<Uint8Array> => {
  const stream = await api.createDecompressStream!(options)
  const codes = api.BrotliStreamResultCode!
  const out: Uint8Array[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = stream.decompress(input.subarray(offset, offset + chunkSize), outputSize)
    out.push(res.buf)
    offset += res.input_offset
    if (res.code === codes.ResultSuccess) break
    if (res.code === codes.NeedsMoreInput && offset >= input.byteLength) {
      throw new Error('stream ended before ResultSuccess')
    }
  }
  stream.free()
  return concat(out)
}

/**
 * Build the full vector list from the given fixtures. Pure function — same
 * fixtures in always yield the same vectors out, which keeps the contract
 * deterministic and easy to unit-test in-repo.
 */
export const buildVectors = (f: ParityFixtures): ParityVector[] => {
  const dictionary = fromB64(f.DICTIONARY_BASE64)
  const dictCompressed = fromB64(f.DICT_COMPRESSED_BASE64)
  const plainCompressed = fromB64(f.PLAIN_COMPRESSED_BASE64)
  const repeatedBase = enc(f.REPEATED_DICTIONARY_BASE)
  // mirror src/dict.test.ts: the dictionary is the keyword sequence x256
  const repeatedDictionary = (() => {
    const dict = new Uint8Array(repeatedBase.length * 256)
    for (let i = 0; i < 256; i++) dict.set(repeatedBase, i * repeatedBase.length)
    return dict
  })()
  const repeatedDictCompressed = fromB64(f.REPEATED_DICT_COMPRESSED_BASE64)

  const compress = (a: ParityApi) => a.compress!

  return [
    // --- compress: default config (quality 11) — the headline SECURITY guarantee
    {
      id: 'compress/default/test-input',
      entry: 'main',
      origin: 'wasm.test / readme.test / js.test — default round-trip of TEST_INPUT',
      run: async (a) => compress(a)(enc(f.TEST_INPUT)),
    },
    {
      id: 'compress/default/multibyte',
      entry: 'main',
      origin: "readme.test — 'Hello🤖!' multi-byte UTF-8 input",
      run: async (a) => compress(a)(enc('Hello🤖!')),
    },
    {
      id: 'compress/default/external',
      entry: 'external',
      origin: 'external.test — default round-trip via the external WASM variant',
      run: async (a) => compress(a)(enc(f.TEST_INPUT)),
    },

    // --- compress: custom dictionary (quality 11)
    {
      id: 'compress/dict/expected',
      entry: 'main',
      origin: 'dict.test — compress(EXPECTED, { quality: 11, customDictionary })',
      run: async (a) => compress(a)(enc(f.EXPECTED), { quality: 11, customDictionary: dictionary }),
    },
    {
      id: 'compress/dict/keywords',
      entry: 'main',
      origin: 'dict.test — "Custom dictionary measurably shrinks the output"',
      run: async (a) =>
        compress(a)(enc('function const return interface string number boolean'), {
          quality: 11,
          customDictionary: dictionary,
        }),
    },

    // --- compress: repeated dictionary across qualities 5 / 9 / 11
    {
      id: 'compress/repeat-dict/q5',
      entry: 'main',
      origin: 'dict.test — quality loop (q5) with repeated dictionary',
      run: async (a) => compress(a)(enc(f.EXPECTED.repeat(8)), { quality: 5, customDictionary: repeatedDictionary }),
    },
    {
      id: 'compress/repeat-dict/q9',
      entry: 'main',
      origin: 'dict.test — quality loop (q9) with repeated dictionary',
      run: async (a) => compress(a)(enc(f.EXPECTED.repeat(8)), { quality: 9, customDictionary: repeatedDictionary }),
    },
    {
      id: 'compress/repeat-dict/q11',
      entry: 'main',
      origin: 'dict.test — quality loop (q11) with repeated dictionary',
      run: async (a) => compress(a)(enc(f.EXPECTED.repeat(8)), { quality: 11, customDictionary: repeatedDictionary }),
    },

    // --- streaming compress (stream.test)
    {
      id: 'stream/compress/default',
      entry: 'main',
      origin: 'stream.test — streaming compress (chunked, tiny output buffer)',
      run: async (a) => streamCompress(a, enc(f.TEST_INPUT), 4096, 256, { quality: 11 }),
    },
    {
      id: 'stream/compress/dict',
      entry: 'main',
      origin: 'stream.test — streaming round-trip with a custom dictionary',
      run: async (a) => streamCompress(a, enc(f.EXPECTED), 32, 128, { quality: 11, customDictionary: dictionary }),
    },

    // --- decompress: version-independent baked golden inputs
    {
      id: 'decompress/plain/default',
      entry: 'main',
      origin: 'wasm.test — decode the pinned PLAIN_COMPRESSED_BASE64 golden blob',
      run: async (a) => (await a.decompress!(plainCompressed)) as Uint8Array,
    },
    {
      id: 'decompress/plain/external',
      entry: 'external',
      origin: 'external.test — decode the pinned golden blob via the external variant',
      run: async (a) => (await a.decompress!(plainCompressed)) as Uint8Array,
    },
    {
      id: 'decompress/dict/main',
      entry: 'main',
      origin: 'dict.test — decompress(DICT_COMPRESSED, { customDictionary })',
      run: async (a) => (await a.decompress!(dictCompressed, { customDictionary: dictionary })) as Uint8Array,
    },
    {
      id: 'decompress/dict/js',
      entry: 'js',
      origin: 'dict.test — jsDecompress(DICT_COMPRESSED, { customDictionary })',
      run: async (a) => (await a.decompress!(dictCompressed, { customDictionary: dictionary })) as Uint8Array,
    },
    {
      id: 'decompress/repeat-dict/main',
      entry: 'main',
      origin: 'dict.test — WASM decoder repeated-dictionary regression (RFC 7932 §4)',
      run: async (a) =>
        (await a.decompress!(repeatedDictCompressed, { customDictionary: repeatedDictionary })) as Uint8Array,
    },
    {
      id: 'decompress/repeat-dict/js',
      entry: 'js',
      origin: 'dict.test — JS decoder repeated-dictionary regression (RFC 7932 §4)',
      run: async (a) =>
        (await a.decompress!(repeatedDictCompressed, { customDictionary: repeatedDictionary })) as Uint8Array,
    },

    // --- streaming decompress of the plain golden (stream.test path)
    {
      id: 'stream/decompress/plain',
      entry: 'main',
      origin: 'stream.test — streaming decompress of the pinned golden blob',
      run: async (a) => streamDecompress(a, plainCompressed, 512, 4096),
    },
  ]
}
