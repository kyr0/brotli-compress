// End-to-end backward-compatibility sweep.
//
// For EVERY released version of brotli-compress on npm, this:
//   1. installs that version into a scratch consumer,
//   2. compresses a fixed string with THAT version's `compress`,
//   3. decompresses the result with the CURRENT build, and
//   4. asserts the round-trip matches.
//
// The current decoder MUST always be able to decode output produced by any past
// release (Brotli streams are forwards/backwards compatible by design; this
// proves the package keeps that guarantee end-to end).
//
// Run via `npm run test:e2e` (builds first). Network required (npm view +
// per-version install). Hard-fails (exit 1) only when the current build cannot
// decode a past release's output; versions whose own compress can't be driven
// (ancient/incompatible API) are reported as warnings, not failures.

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// current build's decoder — the thing under test
import { decompress } from '../index.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// a single, multi-byte, repetitive payload — representative of real usage
const E2E_INPUT =
  'The quick brown fox 🦊 jumps over 13 lazy dogs.\n' +
  'Brotli end-to-end backward-compatibility sweep.\n' +
  'abracadabra '.repeat(64)

const sh = (cmd: string, args: string[], opts: Record<string, unknown> = {}) =>
  spawnSync(cmd, args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, ...opts })

// one scratch consumer, reused across versions (reinstall per version)
const scratch = path.join(REPO, 'tmp', 'e2e-releases')
rmSync(scratch, { recursive: true, force: true })
mkdirSync(scratch, { recursive: true })
writeFileSync(
  path.join(scratch, 'package.json'),
  JSON.stringify({ name: 'e2e-consumer', version: '1.0.0', private: true, type: 'module' }, null, 2),
)
cpSync(path.join(REPO, 'scripts', 'e2e-releases', 'compress-probe.mjs'), path.join(scratch, 'compress-probe.mjs'))

const versions = JSON.parse(sh(NPM, ['view', 'brotli-compress', 'versions', '--json']).stdout) as string[]

// The first three releases predate the current compress API / runtime: 1.0.0 has
// no `compress` export at all (early prototype layout), and 1.1.x load the wasm
// via a path whose returned Promise can't be awaited on modern Node
// ("Method Promise.prototype.then called on incompatible receiver"). They cannot
// produce compressed output to test, so they are intentionally skipped.
const SKIP_VERSIONS = new Set(['1.0.0', '1.1.0', '1.1.1'])

console.log(`sweeping ${versions.length} released version(s): ${versions.join(', ')}\n`)

interface Result {
  v: string
  status: 'ok' | 'decode-mismatch' | 'decode-failed' | 'compress-skipped' | 'install-failed' | 'known-incompatible'
  detail?: string
}
const results: Result[] = []
let failed = false

for (const v of versions) {
  process.stdout.write(`• ${v.padEnd(10)} `)

  if (SKIP_VERSIONS.has(v)) {
    console.log('skipped (known-incompatible — see source)')
    results.push({ v, status: 'known-incompatible' })
    continue
  }

  const inst = sh(NPM, ['install', '--no-audit', '--no-fund', `brotli-compress@${v}`], { cwd: scratch })
  if (inst.status !== 0) {
    console.log('install-failed')
    results.push({ v, status: 'install-failed', detail: inst.stderr })
    continue
  }

  const probe = sh('node', ['compress-probe.mjs'], { cwd: scratch, env: { ...process.env, E2E_INPUT } })
  if (probe.status !== 0) {
    // the old version couldn't be driven to compress — a harness limitation, not
    // a backward-compat regression. Report as a warning and move on.
    console.log(`compress-skipped (${(probe.stderr || '').trim() || 'exit ' + probe.status})`)
    results.push({ v, status: 'compress-skipped', detail: probe.stderr })
    continue
  }

  try {
    const bytes = new Uint8Array(Buffer.from(probe.stdout.trim(), 'base64'))
    const out = await decompress(bytes)
    const ok = Buffer.from(out).toString('utf-8') === E2E_INPUT
    console.log(ok ? '✓ decoded' : '✗ DECODE MISMATCH')
    results.push({ v, status: ok ? 'ok' : 'decode-mismatch' })
    if (!ok) failed = true
  } catch (e) {
    console.log(`✗ DECODE FAILED: ${(e as Error).message}`)
    results.push({ v, status: 'decode-failed', detail: (e as Error).message })
    failed = true
  }
}

console.log('\n=== summary ===')
const drivable = versions.filter((v) => !SKIP_VERSIONS.has(v))
const ok = results.filter((r) => r.status === 'ok').length
const incompatible = results.filter((r) => r.status === 'known-incompatible')
const skipped = results.filter((r) => r.status === 'compress-skipped' || r.status === 'install-failed')
const broken = results.filter((r) => r.status === 'decode-mismatch' || r.status === 'decode-failed')
console.log(`${ok}/${drivable.length} drivable versions: current build decodes their compressed output`)
if (incompatible.length) console.log(`⏭️  intentionally skipped (known-incompatible): ${incompatible.map((r) => r.v).join(', ')}`)
if (skipped.length) console.log(`⚠️  skipped (couldn't drive old compress): ${skipped.map((r) => r.v).join(', ')}`)
if (broken.length) {
  console.log(`❌ BACKWARD-COMPAT BROKEN on: ${broken.map((r) => r.v).join(', ')}`)
  process.exit(1)
}
console.log('backward-compatibility: ✅ PASS')
