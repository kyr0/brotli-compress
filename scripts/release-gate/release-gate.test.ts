// Unit tests for the release-parity gate's pure logic. These cover the helpers
// that decide pass/fail (structural + symbol parity) and the test-import
// rewriting, plus the shape/determinism of the parity vector contract — without
// needing network, tarballs, or an installed package (those are exercised
// end-to-end by `npm run gate`).

import { expect, it } from 'vitest'
import * as input from '../../src/__test__/input'
import * as dict from '../../src/__test__/dictionary'
import { buildVectors, type EntryPoint, type ParityFixtures } from './vectors'
import { conditionKeys, exportTargetFiles, rewriteTestImports } from './release-gate'

const fixtures: ParityFixtures = {
  TEST_INPUT: input.TEST_INPUT,
  PLAIN_COMPRESSED_BASE64: input.PLAIN_COMPRESSED_BASE64,
  DICTIONARY_BASE64: dict.DICTIONARY_BASE64,
  DICT_COMPRESSED_BASE64: dict.DICT_COMPRESSED_BASE64,
  EXPECTED: dict.EXPECTED,
  REPEATED_DICTIONARY_BASE: dict.REPEATED_DICTIONARY_BASE,
  REPEATED_DICT_COMPRESSED_BASE64: dict.REPEATED_DICT_COMPRESSED_BASE64,
  REPEATED_DICT_EXPECTED_BASE64: dict.REPEATED_DICT_EXPECTED_BASE64,
}

// ---- conditionKeys: detects dropped ESM/CJS/types/default conditions --------
it('conditionKeys: a bare-string export exposes only the default condition', () => {
  expect(conditionKeys('./brotli_wasm_bg.wasm')).toEqual(['default'])
})

it('conditionKeys: nested import/require/types/default conditions are all collected', () => {
  const entry = {
    import: { types: './dist/index.d.mts', default: './index.mjs' },
    require: { types: './dist/index.d.cts', default: './index.cjs' },
  }
  const keys = new Set(conditionKeys(entry))
  for (const k of ['import', 'require', 'types', 'default']) expect(keys.has(k)).toBe(true)
})

it('conditionKeys: removing the require condition is detectable (CJS format drop)', () => {
  const withCjs = { import: { default: './index.mjs' }, require: { default: './index.cjs' } }
  const cjsDropped = { import: { default: './index.mjs' } }
  const removed = new Set(conditionKeys(withCjs))
  for (const k of conditionKeys(cjsDropped)) removed.delete(k)
  expect([...removed]).toEqual(['require'])
})

// ---- exportTargetFiles: the importable file set that must never shrink -------
it('exportTargetFiles: collects exports + main/module/types targets, normalized', () => {
  const files = exportTargetFiles({
    main: './index.cjs',
    module: './index.mjs',
    types: './dist/index.d.ts',
    exports: {
      '.': { import: { default: './index.mjs' }, require: { default: './index.cjs' } },
      './js': { import: { default: './js.mjs' } },
      './brotli_wasm_bg.wasm': './brotli_wasm_bg.wasm',
    },
  })
  expect(files).toEqual(
    expect.arrayContaining(['index.cjs', 'index.mjs', 'dist/index.d.ts', 'js.mjs', 'brotli_wasm_bg.wasm']),
  )
  // no leading "./" so paths line up with the unpacked-tarball walk
  expect(files.every((f) => !f.startsWith('./'))).toBe(true)
})

// ---- rewriteTestImports: repo test paths -> bare package specifiers ---------
it('rewriteTestImports: rewrites every build-artifact import form to a bare specifier', () => {
  expect(rewriteTestImports(`import { x } from '../index'`)).toBe(`import { x } from 'brotli-compress'`)
  expect(rewriteTestImports(`import { x } from '../index.mjs'`)).toBe(`import { x } from 'brotli-compress'`)
  expect(rewriteTestImports(`import { x } from '../js'`)).toBe(`import { x } from 'brotli-compress/js'`)
  expect(rewriteTestImports(`import { x } from '../js.mjs'`)).toBe(`import { x } from 'brotli-compress/js'`)
  expect(rewriteTestImports(`import { x } from '../index.external.mjs'`)).toBe(`import { x } from 'brotli-compress/external'`)
})

it('rewriteTestImports: "../index" must NOT corrupt "../index.mjs" (no .mjs leakage)', () => {
  const out = rewriteTestImports(`import a from '../index.mjs'\nimport b from '../index'`)
  expect(out).toBe(`import a from 'brotli-compress'\nimport b from 'brotli-compress'`)
  expect(out).not.toContain('brotli-compress.mjs')
})

// ---- buildVectors: the byte-parity contract is well-formed & stable ---------
it('buildVectors: produces a non-empty contract of well-formed vectors', () => {
  const vs = buildVectors(fixtures)
  expect(vs.length).toBeGreaterThan(10)
  const validEntries = new Set<EntryPoint>(['main', 'js', 'external'])
  for (const v of vs) {
    expect(typeof v.id).toBe('string')
    expect(v.id.length).toBeGreaterThan(0)
    expect(typeof v.origin).toBe('string')
    expect(validEntries.has(v.entry)).toBe(true)
    expect(typeof v.run).toBe('function')
  }
})

it('buildVectors: every vector id is unique (ids are the stable fingerprint keys)', () => {
  const ids = buildVectors(fixtures).map((v) => v.id)
  expect(new Set(ids).size).toBe(ids.length)
})

it('buildVectors: is deterministic — same fixtures yield the same id sequence', () => {
  const a = buildVectors(fixtures).map((v) => v.id)
  const b = buildVectors(fixtures).map((v) => v.id)
  expect(a).toEqual(b)
})

it('buildVectors: covers every entry point and the default compress config', () => {
  const vs = buildVectors(fixtures)
  const entries = new Set(vs.map((v) => v.entry))
  expect(entries.has('main')).toBe(true)
  expect(entries.has('js')).toBe(true)
  expect(entries.has('external')).toBe(true)
  expect(vs.some((v) => v.id === 'compress/default/test-input')).toBe(true)
  expect(vs.some((v) => v.id === 'decompress/repeat-dict/js')).toBe(true)
})
