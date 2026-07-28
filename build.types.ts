// Generates dual-format type declarations.
//
// tsc emits plain `.d.ts` files, which Node/TypeScript interpret according to
// the nearest package.json `"type"` field (ESM here) — so CommonJS consumers
// would get ESM typings for the CJS entry points (flagged by publint and
// "Are The Types Wrong"). Copy every declaration to `.d.mts` (ESM) and
// `.d.cts` (CJS) variants; the export map points each condition at its match.
// Relative `./x.js` specifiers inside the declarations resolve to the
// corresponding `.d.mts`/`.d.cts` files automatically.

import { readdir, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

const distDir = new URL('./dist', import.meta.url).pathname

for (const file of await readdir(distDir)) {
  if (!file.endsWith('.d.ts')) continue
  const base = join(distDir, file.slice(0, -'.d.ts'.length))
  await copyFile(join(distDir, file), `${base}.d.mts`)
  await copyFile(join(distDir, file), `${base}.d.cts`)
  console.log(`types: ${file} -> .d.mts / .d.cts`)
}
