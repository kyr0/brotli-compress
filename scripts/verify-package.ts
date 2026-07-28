// Consumer test for the packed package:
// 1. `npm pack` the repo (runs the `prepack` build, exactly like publish)
// 2. install the tarball into a scratch project
// 3. exercise every entry point from CommonJS and ESM consumers
// 4. check the package with publint and "Are The Types Wrong"
//
// Run via `npm run verify:package`.

import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (cmd, args, cwd) => {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const out = execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (out.trim()) console.log(out.trim())
  return out
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// 1. pack (stdout also contains prepack build logs, so extract the JSON array)
const packOut = run(npm, ['pack', '--json'], process.cwd())
const tarball = JSON.parse(packOut.slice(packOut.indexOf('['), packOut.lastIndexOf(']') + 1))[0].filename
console.log(`packed ${tarball}`)

const scratch = mkdtempSync(join(tmpdir(), 'brotli-compress-consumer-'))

try {
  // 2. install into a scratch project
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0' }))
  run(npm, ['install', '--no-audit', '--no-fund', join(process.cwd(), tarball)], scratch)

  // 3. smoke tests
  writeFileSync(
    join(scratch, 'smoke.cjs'),
    `
const { compress, decompress } = require('brotli-compress')
const { decompress: jsDecompress } = require('brotli-compress/js')
;(async () => {
  const input = new TextEncoder().encode('cjs smoke test input, cjs smoke test input')
  const compressed = await compress(input)
  const out = await decompress(compressed)
  if (new TextDecoder().decode(out) !== 'cjs smoke test input, cjs smoke test input') throw new Error('cjs round trip failed')
  const jsOut = jsDecompress(compressed)
  if (new TextDecoder().decode(jsOut) !== 'cjs smoke test input, cjs smoke test input') throw new Error('cjs js-variant decode failed')
  console.log('cjs smoke test passed')
})().catch((e) => { console.error(e); process.exit(1) })
`,
  )
  writeFileSync(
    join(scratch, 'smoke.mjs'),
    `
import { compress, decompress } from 'brotli-compress'
import { decompress as jsDecompress } from 'brotli-compress/js'
import { compress as extCompress, decompress as extDecompress } from 'brotli-compress/external'

const input = new TextEncoder().encode('esm smoke test input, esm smoke test input')
const expected = 'esm smoke test input, esm smoke test input'
const compressed = await compress(input)
if (new TextDecoder().decode(await decompress(compressed)) !== expected) throw new Error('esm round trip failed')
if (new TextDecoder().decode(jsDecompress(compressed)) !== expected) throw new Error('esm js-variant decode failed')
const extCompressed = await extCompress(input)
if (new TextDecoder().decode(await extDecompress(extCompressed)) !== expected) throw new Error('external variant round trip failed')
console.log('esm smoke test passed')
`,
  )
  run(process.execPath, ['smoke.cjs'], scratch)
  run(process.execPath, ['smoke.mjs'], scratch)

  // 4. packaging linters
  // attw rule exemptions, all by design:
  // - no-resolution: the .wasm asset subpath has no JS/types, and node10
  //   cannot resolve "exports" subpaths at all
  // - cjs-resolves-to-esm: ./external (and the .mjs subpaths) are ESM-only
  // - untyped-resolution: only reported for node10, which the package does
  //   not support (engines: node >= 18)
  // lint the already-packed tarball directly. Passing the tarball makes publint
  // inspect it instead of re-packing itself — publint's auto-pack uses
  // `bun pack` when bun.lockb is present, which isn't available in CI.
  run('npx', ['--yes', 'publint', tarball], process.cwd())
  run(
    'npx',
    [
      '--yes',
      '@arethetypeswrong/cli',
      '--pack',
      tarball,
      '--format',
      'table',
      '--ignore-rules',
      'no-resolution',
      'cjs-resolves-to-esm',
      'untyped-resolution',
    ],
    process.cwd(),
  )

  console.log('package verification passed')
} finally {
  rmSync(scratch, { recursive: true, force: true })
  rmSync(join(process.cwd(), tarball), { force: true })
}
