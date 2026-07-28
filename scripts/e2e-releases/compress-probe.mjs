// Compresses a fixed input with whatever version of brotli-compress is installed
// in node_modules, and prints the compressed bytes as base64 to stdout.
//
// Run inside the per-version scratch consumer:
//     E2E_INPUT="<string>" node compress-probe.mjs
//
// Exit codes (so the orchestrator can tell a harness problem from a real one):
//   0  ok — base64 on stdout
//   2  E2E_INPUT env missing
//   3  could not import brotli-compress (e.g. ancient/incompatible layout)
//   4  no `compress` export found
//   5  compress() threw

const INPUT = process.env.E2E_INPUT
if (!INPUT) {
  console.error('E2E_INPUT env var is required')
  process.exit(2)
}

let mod
try {
  // dynamic import so we tolerate both ESM named exports and CJS default
  // exports across the package's history
  mod = await import('brotli-compress')
} catch (e) {
  console.error('import-failed: ' + (e && e.message ? e.message : String(e)))
  process.exit(3)
}

const compress = mod.compress || (mod.default && mod.default.compress)
if (typeof compress !== 'function') {
  console.error('no-compress-export')
  process.exit(4)
}

try {
  const out = await compress(new TextEncoder().encode(INPUT))
  process.stdout.write(Buffer.from(out).toString('base64'))
} catch (e) {
  console.error('compress-failed: ' + (e && e.message ? e.message : String(e)))
  process.exit(5)
}
