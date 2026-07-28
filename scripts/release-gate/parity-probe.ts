/**
 * Runs every parity vector (see ./vectors.ts) against an INSTALLED
 * `brotli-compress` package and prints a JSON fingerprint to stdout:
 *   - the exported symbol set per entry point / module format (ESM + CJS), and
 *   - the sha256 + byte length of each vector's output, per format.
 *
 * WHY: the release-gate orchestrator runs this probe twice — once against the
 * latest published tarball and once against the upcoming one (each installed
 * into its own scratch consumer) — then diffs the two fingerprints. Equal
 * fingerprints == the upcoming release is byte-for-byte behaviour-identical for
 * every known configuration (the SECURITY.md promise), and symbol-superset
 * checks prove nothing importable was removed.
 *
 * It is executed with `tsx` inside a scratch consumer where `brotli-compress`
 * resolves to the tarball under test:
 *     tsx parity-probe.ts
 *
 * It loads `./fixtures/*` (copied next to it by the orchestrator) rather than
 * reaching back into the repo, so the probe is fully self-contained.
 */
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { buildVectors, type EntryPoint, type ParityApi } from './vectors'
import * as inputFixtures from './fixtures/input'
import * as dictFixtures from './fixtures/dictionary'

const require = createRequire(import.meta.url)

// entry point -> bare specifier + which module formats ship for it.
// `external` is ESM-only by design (see package.json `exports`).
const ENTRIES: Record<EntryPoint, { specifier: string; formats: ReadonlyArray<'esm' | 'cjs'> }> = {
  main: { specifier: 'brotli-compress', formats: ['esm', 'cjs'] },
  js: { specifier: 'brotli-compress/js', formats: ['esm', 'cjs'] },
  external: { specifier: 'brotli-compress/external', formats: ['esm'] },
}

const sha256 = (u8: Uint8Array): string => createHash('sha256').update(u8).digest('hex')

const sortedKeys = (m: object): string[] => Object.keys(m).sort()

// Loads an entry point in the requested format. ESM via dynamic import, CJS via
// createRequire so a single Node process can exercise both module systems.
const load = async (specifier: string, format: 'esm' | 'cjs'): Promise<ParityApi> => {
  if (format === 'esm') return (await import(specifier)) as ParityApi
  return require(specifier) as ParityApi
}

const fixtures = { ...inputFixtures, ...dictFixtures } as Record<string, string>
const vectors = buildVectors(fixtures)

type Formatted = Record<string, { sha256: string; bytes: number } | { error: string }>

const symbols: Record<string, Record<string, string[]>> = {}
const vectorFingerprint: Record<string, { entry: EntryPoint; origin: string; formats: Formatted }> = {}
const errors: string[] = []

// 1) exported symbol introspection per entry point / format
for (const [entry, { specifier, formats }] of Object.entries(ENTRIES)) {
  symbols[entry] = {}
  for (const fmt of formats) {
    try {
      symbols[entry][fmt] = sortedKeys(await load(specifier, fmt))
    } catch (e) {
      // a missing/dropped format is itself a contract regression — record empty
      symbols[entry][fmt] = []
      errors.push(`symbols[${entry}][${fmt}]: ${(e as Error).message}`)
    }
  }
}

// 2) vector outputs per entry point / format
for (const v of vectors) {
  const { specifier, formats } = ENTRIES[v.entry]
  const formatted: Formatted = {}
  for (const fmt of formats) {
    try {
      const api = await load(specifier, fmt)
      const result = await v.run(api)
      formatted[fmt] = { sha256: sha256(result), bytes: result.byteLength }
    } catch (e) {
      formatted[fmt] = { error: (e as Error).message }
      errors.push(`vector[${v.id}][${fmt}]: ${(e as Error).message}`)
    }
  }
  vectorFingerprint[v.id] = { entry: v.entry, origin: v.origin, formats: formatted }
}

// JSON to stdout — the orchestrator parses this (and only this) line of output.
console.log(JSON.stringify({ symbols, vectors: vectorFingerprint, errors }, null, 2))
