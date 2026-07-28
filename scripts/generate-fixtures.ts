// Generates the golden `.br` fixture corpus under src/__test__/fixtures/.
//
// Each fixture is the canonical WASM-compressed output for one (input, quality,
// dictionary?) configuration. Together they pin compress + decompress output at
// the binary level, so that bumping the upstream WASM package (or touching
// either decoder) is caught immediately by `npm test` / the release gate.
//
// The encoder is deterministic, so recompressing the same source with the same
// config MUST reproduce these exact bytes — that is asserted by
// src/fixtures.test.ts. Re-run after an *intentional* behaviour change:
//     npm run fixtures:generate
//
// NOTE: this uses the shipped WASM build (../index.mjs), so build first
// (the `fixtures:generate` script does `npm run build` before running this).

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compress } from '../index.mjs'
import { INPUTS, DICTIONARIES, type Source } from '../src/__test__/fixtures/sources'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(REPO, 'src', '__test__', 'fixtures')
mkdirSync(OUT, { recursive: true })

const lookup = (arr: Source[], name: string): Uint8Array => {
  const s = arr.find((x) => x.name === name)
  if (!s) throw new Error(`unknown source: ${name}`)
  return s.bytes
}

interface Config {
  input: string
  quality: number
  dictionary?: string
}

// a broad, deterministic matrix: small inputs across qualities 1/5/9/11,
// plus the large payload at two qualities, plus dictionary variants on ts-code.
const SMALL_QUALITIES = [1, 5, 9, 11]
const CONFIGS: Config[] = []

for (const input of INPUTS.filter((i) => i.name !== 'large-repetitive').map((i) => i.name)) {
  for (const q of SMALL_QUALITIES) CONFIGS.push({ input, quality: q })
}
CONFIGS.push({ input: 'large-repetitive', quality: 5 })
CONFIGS.push({ input: 'large-repetitive', quality: 11 })
for (const q of [5, 9, 11]) CONFIGS.push({ input: 'ts-code', quality: q, dictionary: 'ts-keywords' })
for (const q of [9, 11]) CONFIGS.push({ input: 'ts-code', quality: q, dictionary: 'repeated-ts' })

const entries: object[] = []

for (const c of CONFIGS) {
  const input = lookup(INPUTS, c.input)
  const dict = c.dictionary ? lookup(DICTIONARIES, c.dictionary) : undefined
  const options = { quality: c.quality, ...(dict ? { customDictionary: dict } : {}) }
  const compressed = await compress(input, options)
  const file = `${c.input}-q${c.quality}${c.dictionary ? `-d-${c.dictionary}` : ''}.br`
  writeFileSync(path.join(OUT, file), compressed)
  entries.push({
    file,
    input: c.input,
    quality: c.quality,
    dictionary: c.dictionary ?? null,
    inputBytes: input.byteLength,
    compressedBytes: compressed.byteLength,
  })
  console.log(`${file}: ${input.byteLength} -> ${compressed.byteLength} bytes`)
}

const manifest = {
  generatedBy: 'scripts/generate-fixtures.ts (run via `npm run fixtures:generate`)',
  encoder: 'brotli-compress WASM (../index.mjs)',
  note: 'Recompressing the named source with the listed config must reproduce these exact bytes. See src/fixtures.test.ts.',
  configs: entries,
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`\nwrote ${CONFIGS.length} fixtures + manifest.json to ${path.relative(REPO, OUT)}`)
