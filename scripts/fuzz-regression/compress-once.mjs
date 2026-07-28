// Per-config fuzz probe, run in a FRESH node process.
//
// Compresses (payload, { quality, customDictionary }) with the current build
// and asserts it does NOT panic and round-trips through decompress. One process
// per (input, quality) is deliberate: a regressed encoder trap poisons the WASM
// instance for the rest of the process (see fuzzing_learning.md → "WASM instance
// poisoning"), so isolating each config keeps a regression local + diagnosable.
//
// args: <payloadBase64> <dictBase64> <quality>
// exit: 0 ok | 2 compress threw (panic/regression) | 3 round-trip mismatch

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
// the current build under test (inlined WASM, self-contained)
const { compress, decompress } = await import(path.resolve(here, '../../index.mjs'))

const [pb64, db64, qStr] = process.argv.slice(2)
const payload = new Uint8Array(Buffer.from(pb64, 'base64'))
const dict = new Uint8Array(Buffer.from(db64, 'base64'))
const quality = Number(qStr)

try {
  const out = await compress(payload, { quality, customDictionary: dict })
  const back = await decompress(out, { customDictionary: dict })
  if (!Buffer.from(back).equals(Buffer.from(payload))) {
    console.error('round-trip mismatch')
    process.exit(3)
  }
  console.log(`ok ${out.length} bytes`)
  process.exit(0)
} catch (e) {
  console.error('compress-failed: ' + (e && e.message ? e.message : String(e)))
  process.exit(2)
}
