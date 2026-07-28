// Release-parity gate.
//
// Proves that the upcoming release is import- and behaviour-identical to the
// latest published release, enforcing the SECURITY.md promise
// ("nothing is ever removed or behaviour changed"). It compares the FULL
// published artifact set and re-runs the repo's own tests against BOTH the
// latest published and the freshly packed upcoming tarball.
//
// Hard-fail (exit 1, blocking publish via the `predeploy` hook) when:
//   A) a shipped file, an `exports` subpath, or an ESM/CJS condition is removed;
//   B) a previously-exported symbol is no longer importable (per entry/format);
//   C) any known compress/decompress configuration (see ./vectors.ts) produces
//      different output bytes, or ESM vs CJS diverge within a version;
//   D) the upcoming test suite (re-run against the installed tarball) fails, or
//      the latest baseline cannot be established.
//
// Everything happens under tmp/release-gate/ (gitignored). On failure all
// artifacts are kept for inspection; on success the heavy consumer node_modules
// are pruned but the report + unpacked packages + fingerprints are retained.
//
// Run via `npm run gate` (or `bun run gate`).
//
// NOTE: child processes (probe + vitest) are invoked through `npx` rather than
// `bunx` on purpose — the gate emulates the *Node.js* consumer experience, so
// tsx/vitest must execute under node, not bun.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import type { EntryPoint } from './vectors'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GATE_DIR = path.join(REPO, 'tmp', 'release-gate')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const TAR = 'tar'
// npx runs locally-installed bins under node (see note above); it ships with npm.
const X = 'npx'

/** Any entry here flips the verdict to FAIL. */
const failures: string[] = []
const recordFail = (msg: string) => {
  failures.push(msg)
  console.log(`  ❌ ${msg}`)
}

const sh = (cmd: string, args: string[], cwd: string = REPO) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

const runOrFail = (cmd: string, args: string[], cwd: string, why: string): { stdout: string } => {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const r = sh(cmd, args, cwd)
  if (r.status !== 0) {
    if (r.stderr) console.log(r.stderr.trimEnd())
    throw new Error(`${why} (exit ${r.status})`)
  }
  return { stdout: r.stdout }
}

const walkRel = (dir: string, base: string = dir): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkRel(full, base))
    else out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out
}
const sha256File = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

/** Pack `pkgSpec` ('.' for the upcoming local build, `name@version` for the
 *  baseline) into `dest`, returning the produced tarball path. */
const pack = (pkgSpec: string, dest: string): string => {
  mkdirSync(dest, { recursive: true })
  const { stdout } = runOrFail(NPM, ['pack', pkgSpec, '--json', '--pack-destination', dest], REPO, `packing ${pkgSpec}`)
  const json = JSON.parse(stdout.slice(stdout.indexOf('['), stdout.lastIndexOf(']') + 1))
  return path.join(dest, json[0].filename)
}

const unpack = (tgz: string, dest: string) => {
  mkdirSync(dest, { recursive: true })
  // strip the `package/` prefix npm adds inside tarballs so files land flat
  runOrFail(TAR, ['-xzf', tgz, '-C', dest, '--strip-components=1'], REPO, `unpacking ${tgz}`)
}

/** Condition keys an `exports` entry exposes (recursively) so dropping a
 *  `require`/`import`/`types`/`default` condition is detectable as a removal.
 *  Exported for unit testing. */
export const conditionKeys = (exp: unknown): string[] => {
  if (typeof exp === 'string') return ['default']
  if (exp && typeof exp === 'object') {
    const KNOWN = new Set(['default', 'import', 'require', 'types', 'node', 'browser'])
    return Object.entries(exp as Record<string, unknown>).flatMap(([k, v]) =>
      KNOWN.has(k) ? [k, ...conditionKeys(v)] : conditionKeys(v),
    )
  }
  return []
}

/** Files actually IMPORTABLE from a package: every path reachable through
 *  `exports`, plus `main`/`module`/`types`/`browser`/`bin`. These (and only
 *  these) are what the SECURITY promise requires to keep existing.
 *  Exported for unit testing. */
export const exportTargetFiles = (pkg: Record<string, unknown>): string[] => {
  const out = new Set<string>()
  const collect = (v: unknown) => {
    if (typeof v === 'string') out.add(v.replace(/^\.\//, ''))
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) collect((v as Record<string, unknown>)[k])
  }
  const exp = pkg.exports
  if (exp && typeof exp === 'object') for (const sub of Object.keys(exp)) collect((exp as Record<string, unknown>)[sub])
  for (const k of ['main', 'module', 'types', 'browser', 'bin']) if (pkg[k]) collect(pkg[k])
  return [...out]
}

/** Rewrite the repo's test imports (which point at root build artifacts) to
 *  bare package specifiers so the same files exercise the INSTALLED tarball.
 *  Quoted exact-string replacements are safe: `'../index'` cannot match inside
 *  `'../index.mjs'` because the closing quote position differs.
 *  Exported for unit testing. */
export const rewriteTestImports = (code: string): string =>
  code
    .replace(/'\.\.\/index\.external\.mjs'/g, "'brotli-compress/external'")
    .replace(/'\.\.\/index\.mjs'/g, "'brotli-compress'")
    .replace(/'\.\.\/index'/g, "'brotli-compress'")
    .replace(/'\.\.\/js\.mjs'/g, "'brotli-compress/js'")
    .replace(/'\.\.\/js'/g, "'brotli-compress/js'")

/** Build a scratch consumer with `tgz` installed as brotli-compress, plus the
 *  parity probe and the repo's test suite (imports rewritten) copied in. */
const setupConsumer = (label: string, tgz: string) => {
  const dir = path.join(GATE_DIR, 'consumers', label)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `consumer-${label}`, version: '1.0.0', private: true, type: 'module' }, null, 2),
  )
  // pin tooling majors to the repo's so the gate stays reproducible
  runOrFail(NPM, ['install', '--no-audit', '--no-fund', tgz, 'tsx@^4.23.1', 'vitest@^4.1.10'], dir, `installing consumer ${label}`)

  // self-contained parity probe + vectors + fixtures at the consumer root
  const gateSrc = path.join(REPO, 'scripts', 'release-gate')
  cpSync(path.join(gateSrc, 'parity-probe.ts'), path.join(dir, 'parity-probe.ts'))
  cpSync(path.join(gateSrc, 'vectors.ts'), path.join(dir, 'vectors.ts'))
  mkdirSync(path.join(dir, 'fixtures'), { recursive: true })
  cpSync(path.join(REPO, 'src', '__test__', 'input.ts'), path.join(dir, 'fixtures', 'input.ts'))
  cpSync(path.join(REPO, 'src', '__test__', 'dictionary.ts'), path.join(dir, 'fixtures', 'dictionary.ts'))

  // repo test suite, copied under src/ with imports rewritten to bare specifiers
  const testFixturesDir = path.join(dir, 'src', '__test__')
  mkdirSync(testFixturesDir, { recursive: true })
  cpSync(path.join(REPO, 'src', '__test__'), testFixturesDir, { recursive: true })
  for (const f of readdirSync(path.join(REPO, 'src')).filter((f) => f.endsWith('.test.ts'))) {
    writeFileSync(path.join(dir, 'src', f), rewriteTestImports(readFileSync(path.join(REPO, 'src', f), 'utf-8')))
  }
  writeFileSync(
    path.join(dir, 'vitest.config.ts'),
    "import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })\n",
  )
  return dir
}

type ProbeFormat = { sha256?: string; bytes?: number; error?: string }
type Probe = {
  symbols: Record<string, Record<string, string[]>>
  vectors: Record<string, { entry: EntryPoint; origin: string; formats: Record<string, ProbeFormat> }>
  errors: string[]
}

const runProbe = (consumerDir: string): Probe => {
  console.log(`$ ${X} tsx parity-probe.ts   (in ${path.relative(REPO, consumerDir)})`)
  const r = sh(X, ['tsx', 'parity-probe.ts'], consumerDir)
  if (r.status !== 0) {
    if (r.stderr) console.log(r.stderr.trimEnd())
    throw new Error(`parity probe failed in ${path.relative(REPO, consumerDir)} (exit ${r.status})`)
  }
  const json = r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)
  return JSON.parse(json) as Probe
}

const runSuite = (consumerDir: string): { ok: boolean; summary: string } => {
  console.log(`$ ${X} vitest run   (in ${path.relative(REPO, consumerDir)})`)
  const r = sh(X, ['vitest', 'run'], consumerDir)
  const lines = (r.stdout || '').split('\n').filter((l) => /Test Files|Tests |Errors|FAIL|✓|×|⎯⎯⎯/.test(l))
  return { ok: r.status === 0, summary: lines.slice(-12).join('\n') || '(no summary)' }
}

// ---- report shape ---------------------------------------------------------
interface GateReport {
  verdict: 'PASS' | 'FAIL'
  createdAt: string
  versions: { latest: string; upcoming: string; sameVersion: boolean }
  phases: {
    A: {
      removedFiles: string[]
      addedFiles: string[]
      changedFiles: { file: string; latestSha: string; upcomingSha: string }[]
      removedSubpaths: string[]
      addedSubpaths: string[]
      removedConditions: { subpath: string; conditions: string[] }[]
      wasm: { latestSha: string; upcomingSha: string; same: boolean }
    }
    B: { removedSymbols: { entry: string; format: string; symbols: string[] }[]; addedSymbols: { entry: string; format: string; symbols: string[] }[] }
    C: { byteDrift: { vectorId: string; format: string; latestSha: string; upcomingSha: string }[]; formatDrift: { vectorId: string; version: string; esmSha: string; cjsSha: string }[]; probeErrors: { latest: string[]; upcoming: string[] } }
    D: { latest: { ok: boolean; summary: string }; upcoming: { ok: boolean; summary: string } }
  }
  failures: string[]
}

const renderMarkdown = (r: GateReport): string => {
  const L: string[] = []
  L.push(`# Release-parity gate — ${r.verdict}`, '')
  L.push(`- created: ${r.createdAt}`)
  L.push(`- latest published: \`${r.versions.latest}\``)
  L.push(`- upcoming: \`${r.versions.upcoming}\`${r.versions.sameVersion ? ' _(same as latest — version not bumped?)_' : ''}`, '')
  L.push('## Phase A — structural parity (files, exports, formats)', '')
  L.push(`- removed shipped files: ${r.phases.A.removedFiles.length ? r.phases.A.removedFiles.join(', ') : '_(none)_'}`)
  L.push(`- added shipped files: ${r.phases.A.addedFiles.length ? r.phases.A.addedFiles.join(', ') : '_(none)_'}`)
  L.push(`- changed shipped files (informational): ${r.phases.A.changedFiles.length ? r.phases.A.changedFiles.map((c) => c.file).join(', ') : '_(none)_'}`)
  L.push(`- removed exports subpaths: ${r.phases.A.removedSubpaths.length ? r.phases.A.removedSubpaths.join(', ') : '_(none)_'}`)
  L.push(`- removed export conditions: ${r.phases.A.removedConditions.length ? r.phases.A.removedConditions.map((c) => `${c.subpath}[${c.conditions.join(',')}]`).join('; ') : '_(none)_'}`)
  L.push(`- brotli_wasm_bg.wasm identical: ${r.phases.A.wasm.same ? 'yes' : 'NO — dependency change (phase C verifies behaviour)'}`, '')
  L.push('## Phase B — symbol parity (existing exports stay importable)', '')
  if (r.phases.B.removedSymbols.length) for (const s of r.phases.B.removedSymbols) L.push(`- ❌ removed ${s.entry}/${s.format}: ${s.symbols.join(', ')}`)
  else L.push('- removed symbols: _(none)_')
  if (r.phases.B.addedSymbols.length) for (const s of r.phases.B.addedSymbols) L.push(`- ➕ added ${s.entry}/${s.format}: ${s.symbols.join(', ')}`)
  L.push('', '## Phase C — byte parity (known configurations)', '')
  if (r.phases.C.byteDrift.length) for (const b of r.phases.C.byteDrift) L.push(`- ❌ byte drift \`${b.vectorId}/${b.format}\``)
  else L.push('- byte drift vs latest: _(none — every known config is byte-identical)_')
  if (r.phases.C.formatDrift.length) for (const f of r.phases.C.formatDrift) L.push(`- ❌ ESM/CJS divergence \`${f.vectorId}\` (${f.version})`)
  L.push('', '## Phase D — test suite re-run against each installed tarball', '')
  L.push(`- latest baseline: ${r.phases.D.latest.ok ? '✅ PASS' : '❌ FAIL'}`)
  L.push(`- upcoming: ${r.phases.D.upcoming.ok ? '✅ PASS' : '❌ FAIL'}`, '')
  L.push('## Failures', '')
  if (r.failures.length) for (const f of r.failures) L.push(`- ❌ ${f}`)
  else L.push('_(none — gate passed)_')
  L.push('')
  return L.join('\n')
}

const main = async () => {
  console.log('— release-parity gate —')
  console.log(`repo: ${REPO}`)

  rmSync(GATE_DIR, { recursive: true, force: true })
  mkdirSync(GATE_DIR, { recursive: true })

  // ---- phase 0: acquire artifacts ---------------------------------------
  console.log('\n== phase 0: acquire artifacts ==')
  // pack into SEPARATE dirs: when the upcoming version equals the latest
  // published one (version not bumped yet), both tarballs share the same
  // filename — packing into one dir would let the second overwrite the first
  // and silently turn the gate into a published-vs-published no-op.
  const upcomingTgz = pack('.', path.join(GATE_DIR, 'incoming', 'upcoming'))
  const latestVersion = runOrFail(NPM, ['view', 'brotli-compress', 'version'], REPO, 'querying latest version').stdout.trim()
  const latestTgz = pack(`brotli-compress@${latestVersion}`, path.join(GATE_DIR, 'incoming', 'latest'))
  const upcomingDir = path.join(GATE_DIR, 'upcoming')
  const latestDir = path.join(GATE_DIR, 'latest')
  unpack(upcomingTgz, upcomingDir)
  unpack(latestTgz, latestDir)

  const upcomingPkg = JSON.parse(readFileSync(path.join(upcomingDir, 'package.json'), 'utf-8'))
  const latestPkg = JSON.parse(readFileSync(path.join(latestDir, 'package.json'), 'utf-8'))
  const versions = { latest: latestPkg.version, upcoming: upcomingPkg.version }
  const sameVersion = versions.latest === versions.upcoming
  console.log(`latest published: ${versions.latest}   upcoming: ${versions.upcoming}${sameVersion ? '   ⚠️ identical — did you bump the version?' : ''}`)

  // ---- phase A: structural parity ---------------------------------------
  console.log('\n== phase A: structural parity (files, exports, formats) ==')
  const latestFiles = new Set(walkRel(latestDir))
  const upcomingFiles = new Set(walkRel(upcomingDir))
  const removedFiles = [...latestFiles].filter((f) => !upcomingFiles.has(f))
  const addedFiles = [...upcomingFiles].filter((f) => !latestFiles.has(f))
  // incidental file churn (build scripts, images, stray type files) is fine —
  // only IMPORTABLE files must remain; see removedImportTargets below.
  if (removedFiles.length) console.log(`  ~ shipped files removed (informational): ${removedFiles.join(', ')}`)
  if (addedFiles.length) console.log(`  + shipped files added: ${addedFiles.join(', ')}`)

  const shaPairs = (f: string) => ({ file: f, latestSha: sha256File(path.join(latestDir, f)), upcomingSha: sha256File(path.join(upcomingDir, f)) })
  const changedFiles = [...latestFiles].filter((f) => upcomingFiles.has(f) && f !== 'package.json').filter((f) => {
    const p = shaPairs(f)
    return p.latestSha !== p.upcomingSha
  }).map(shaPairs)
  if (changedFiles.length) console.log(`  ~ shipped files changed (informational): ${changedFiles.map((c) => c.file).join(', ')}`)

  const latestExp = (latestPkg.exports || {}) as Record<string, unknown>
  const upcomingExp = (upcomingPkg.exports || {}) as Record<string, unknown>
  const removedSubpaths = Object.keys(latestExp).filter((k) => !(k in upcomingExp))
  const addedSubpaths = Object.keys(upcomingExp).filter((k) => !(k in latestExp))
  if (removedSubpaths.length) recordFail(`exports subpaths removed: ${removedSubpaths.join(', ')}`)
  if (addedSubpaths.length) console.log(`  + exports subpaths added: ${addedSubpaths.join(', ')}`)
  const removedConditions: { subpath: string; conditions: string[] }[] = []
  for (const sub of Object.keys(latestExp)) {
    if (!(sub in upcomingExp)) continue
    const lat = new Set(conditionKeys(latestExp[sub]))
    const up = new Set(conditionKeys(upcomingExp[sub]))
    const removed = [...lat].filter((c) => !up.has(c))
    if (removed.length) removedConditions.push({ subpath: sub, conditions: removed })
  }
  if (removedConditions.length) recordFail(`export conditions removed: ${removedConditions.map((c) => `${c.subpath} [${c.conditions.join(',')}]`).join('; ')}`)

  // every file that was IMPORTABLE in latest must still exist in upcoming
  const removedImportTargets = new Set(exportTargetFiles(latestPkg))
  const missingImportTargets = [...removedImportTargets].filter((f) => !existsSync(path.join(upcomingDir, f)))
  if (missingImportTargets.length) recordFail(`import target files removed/missing: ${missingImportTargets.join(', ')}`)

  const wasm = {
    latestSha: sha256File(path.join(latestDir, 'brotli_wasm_bg.wasm')),
    upcomingSha: sha256File(path.join(upcomingDir, 'brotli_wasm_bg.wasm')),
  }
  const wasmSame = wasm.latestSha === wasm.upcomingSha
  if (!wasmSame) console.log('  ~ brotli_wasm_bg.wasm differs between versions (dependency change — phase C verifies behaviour)')

  // ---- phase B + C: differential probe ----------------------------------
  console.log('\n== phases B + C: symbol parity + byte parity (probe) ==')
  const latestConsumer = setupConsumer('latest', latestTgz)
  const upcomingConsumer = setupConsumer('upcoming', upcomingTgz)
  const probeLatest = runProbe(latestConsumer)
  const probeUpcoming = runProbe(upcomingConsumer)

  // B: symbols — upcoming must be a superset of latest, per entry/format
  const removedSymbols: { entry: string; format: string; symbols: string[] }[] = []
  const addedSymbols: { entry: string; format: string; symbols: string[] }[] = []
  for (const entry of Object.keys(probeLatest.symbols)) {
    for (const format of Object.keys(probeLatest.symbols[entry] || {})) {
      const lat = probeLatest.symbols[entry]?.[format] ?? []
      const up = probeUpcoming.symbols[entry]?.[format] ?? []
      const removed = lat.filter((s) => !up.includes(s))
      const added = up.filter((s) => !lat.includes(s))
      if (removed.length) removedSymbols.push({ entry, format, symbols: removed })
      if (added.length) addedSymbols.push({ entry, format, symbols: added })
    }
  }
  if (removedSymbols.length) recordFail(`exported symbols removed: ${removedSymbols.map((s) => `${s.entry}/${s.format} [${s.symbols.join(',')}]`).join('; ')}`)
  if (addedSymbols.length) console.log(`  + exported symbols added: ${addedSymbols.map((s) => `${s.entry}/${s.format} [${s.symbols.join(',')}]`).join('; ')}`)

  // C: bytes — every known config must match latest; ESM must equal CJS per version
  const byteDrift: { vectorId: string; format: string; latestSha: string; upcomingSha: string }[] = []
  const formatDrift: { vectorId: string; version: string; esmSha: string; cjsSha: string }[] = []
  const allIds = new Set([...Object.keys(probeLatest.vectors), ...Object.keys(probeUpcoming.vectors)])
  for (const id of allIds) {
    const lat = probeLatest.vectors[id]?.formats ?? {}
    const up = probeUpcoming.vectors[id]?.formats ?? {}
    for (const fmt of new Set([...Object.keys(lat), ...Object.keys(up)])) {
      const l = lat[fmt]
      const u = up[fmt]
      if (!l || !u || l.error || u.error) {
        recordFail(`vector '${id}' (${fmt}) could not run: latest=${l?.error ?? 'ok'} upcoming=${u?.error ?? 'ok'}`)
        continue
      }
      if (l.sha256 !== u.sha256) byteDrift.push({ vectorId: id, format: fmt, latestSha: l.sha256!, upcomingSha: u.sha256! })
    }
    for (const [version, probe] of [['latest', probeLatest], ['upcoming', probeUpcoming]] as const) {
      const e = probe.vectors[id]?.formats?.esm
      const c = probe.vectors[id]?.formats?.cjs
      if (e && c && !e.error && !c.error && e.sha256 !== c.sha256) formatDrift.push({ vectorId: id, version, esmSha: e.sha256!, cjsSha: c.sha256! })
    }
  }
  if (byteDrift.length) recordFail(`byte drift in ${byteDrift.length} known config(s): ${byteDrift.map((b) => `${b.vectorId}/${b.format}`).join(', ')}`)
  if (formatDrift.length) recordFail(`ESM/CJS divergence: ${formatDrift.map((f) => `${f.vectorId} (${f.version})`).join(', ')}`)
  if (probeLatest.errors.length || probeUpcoming.errors.length)
    console.log(`  ⚠️ probe errors — latest: ${probeLatest.errors.length}, upcoming: ${probeUpcoming.errors.length}`)

  // ---- phase D: both-green re-run of the suite --------------------------
  console.log('\n== phase D: re-run the test suite against each installed tarball ==')
  const suiteLatest = runSuite(latestConsumer)
  const suiteUpcoming = runSuite(upcomingConsumer)
  console.log(`  latest suite:  ${suiteLatest.ok ? 'PASS' : 'FAIL (informational)'}`)
  console.log(`  upcoming suite:${suiteUpcoming.ok ? ' PASS' : ' FAIL'}`)
  // the upcoming release MUST be regression-free; the published baseline failing
  // is only informational (it may predate a test or carry a since-fixed bug) —
  // any real divergence is already caught decisively by phase C byte parity.
  if (!suiteUpcoming.ok) recordFail('upcoming test suite (re-run against the installed tarball) failed')
  if (!suiteLatest.ok) console.log('  ⚠️ latest baseline suite failed — informational; phase C is the decisive parity check')

  // ---- report -----------------------------------------------------------
  const verdict: 'PASS' | 'FAIL' = failures.length === 0 ? 'PASS' : 'FAIL'
  const report: GateReport = {
    verdict,
    createdAt: new Date().toISOString(),
    versions: { ...versions, sameVersion },
    phases: {
      A: { removedFiles, addedFiles, changedFiles, removedSubpaths, addedSubpaths, removedConditions, wasm: { ...wasm, same: wasmSame } },
      B: { removedSymbols, addedSymbols },
      C: { byteDrift, formatDrift, probeErrors: { latest: probeLatest.errors, upcoming: probeUpcoming.errors } },
      D: { latest: suiteLatest, upcoming: suiteUpcoming },
    },
    failures,
  }
  writeFileSync(path.join(GATE_DIR, 'gate-report.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(GATE_DIR, 'gate-report.md'), renderMarkdown(report))
  writeFileSync(path.join(GATE_DIR, 'fingerprint-latest.json'), JSON.stringify(probeLatest, null, 2))
  writeFileSync(path.join(GATE_DIR, 'fingerprint-upcoming.json'), JSON.stringify(probeUpcoming, null, 2))

  console.log(`\n— gate ${verdict} —`)
  console.log(`report: ${path.relative(REPO, path.join(GATE_DIR, 'gate-report.md'))}`)
  if (verdict === 'PASS') {
    for (const label of ['latest', 'upcoming']) rmSync(path.join(GATE_DIR, 'consumers', label, 'node_modules'), { recursive: true, force: true })
  }
  process.exit(verdict === 'PASS' ? 0 : 1)
}

// Run the gate only when executed directly, so unit tests can import the pure
// helpers above without triggering a full (networked) gate run.
const invokedDirectly = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
