// Fuzzing regression sweep.
//
// Pins the custom-dictionary encoder panic documented in fuzzing_learning.md:
// `compress()` trapped with `RuntimeError: unreachable` for certain dictionary
// inputs at qualities 5–9 (minimal repro panicked at q7/8/9), fixed upstream in
// brotli-wasm-custom-dictionary 3.1.1. This sweeps the known-failing inputs
// (plus broader custom-dictionary coverage) across every quality 0–11, so the
// bug can never silently return.
//
// Each (input, quality) runs in a FRESH node process
// (scripts/fuzz-regression/compress-once.mjs): a regressed trap poisons the WASM
// instance for the whole process, so isolating each config keeps a regression
// local and every other config independently diagnosable.
//
// Run via `npm run test:fuzz` (builds first). Exits non-zero if any config
// panics or fails to round-trip.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROBE = path.join(REPO, 'scripts', 'fuzz-regression', 'compress-once.mjs')

const enc = (s: string): string => Buffer.from(new TextEncoder().encode(s)).toString('base64')

interface FuzzInput {
  name: string
  payload: string
  dictionary: string
  note: string
}

// Inputs anchored on the documented fuzz findings (fuzzing_learning.md).
const INPUTS: FuzzInput[] = [
  {
    // EXACT minimal reproduction from the doc (23B payload / 13B dict; the
    // trailing space in the dictionary is load-bearing). Panicked at q7/8/9.
    name: 'minimal-repro',
    payload: '42ringbaznumberbar 42ba',
    dictionary: 'ingr boolean ',
    note: 'panicked q7,8,9 on 3.1.0',
  },
  {
    // Mirrors the original unminimized find: a keyword-token payload with a
    // keyword dictionary (that case panicked at q5–q9 on 3.1.0).
    name: 'keyword-tokens',
    payload: 'function const return interface string number boolean '.repeat(16),
    dictionary: 'function const return interface string number boolean ',
    note: 'panicked q5-9 on 3.1.0 (keyword-token class)',
  },
  {
    // Exercises the distance ring-buffer path with a custom dictionary
    // (the same area the pure-JS RFC 7932 §4 fix touches).
    name: 'repeated-dict',
    payload: 'function foo(): number { return 42; } '.repeat(24),
    dictionary: 'function return number boolean interface string const '.repeat(4),
    note: 'dictionary ring-buffer coverage',
  },
]

const QUALITIES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

const sh = (args: string[]) =>
  spawnSync('node', args, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 })

const total = INPUTS.length * QUALITIES.length
console.log(`fuzz regression sweep: ${INPUTS.length} inputs x ${QUALITIES.length} qualities = ${total} configs (fresh process each)\n`)

let failed = false
let succeeded = 0
for (const inp of INPUTS) {
  console.log(`# ${inp.name} — ${inp.note}`)
  for (const q of QUALITIES) {
    const r = sh([PROBE, enc(inp.payload), enc(inp.dictionary), String(q)])
    const ok = r.status === 0
    if (ok) succeeded++
    else failed = true
    console.log(`  ${ok ? '✓' : '✗'} q${String(q).padEnd(2)}  ${(r.stdout || r.stderr || '').trim()}`)
  }
}

console.log(`\n${succeeded}/${total} configs compress + round-trip cleanly`)
if (failed) {
  console.log('❌ FUZZ REGRESSION: at least one custom-dictionary config panicked or failed (see fuzzing_learning.md)')
  process.exit(1)
}
console.log('✅ fuzz regression: no panics, all round-trips valid')
