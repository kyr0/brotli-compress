// Memory benchmark for https://github.com/kyr0/brotli-compress/issues/...
// ("buffer whose size increases every time a compression is run")
//
// Run with: node --expose-gc bench/memory.mjs
//
// Expected result with the current build: after a one-time warmup
// (the WASM encoder allocates its working buffers on first use),
// wasm linear memory and RSS stay flat regardless of iteration count.

import { compress, decompress } from '../index.mjs'
import { Buffer } from 'node:buffer'

const mb = (n) => (n / 1024 / 1024).toFixed(1)
const stats = (label) => {
  globalThis.gc && globalThis.gc()
  const m = process.memoryUsage()
  console.log(
    `${label}: heapUsed=${mb(m.heapUsed)}MB heapTotal=${mb(m.heapTotal)}MB rss=${mb(m.rss)}MB`,
  )
}

const input = new TextEncoder().encode(JSON.stringify({ foo: 'bar' }))
let sink = 0

stats('start')
for (let round = 1; round <= 5; round++) {
  for (let i = 0; i < 10000; i++) {
    sink ^= (await compress(input))[0]
  }
  stats(`after ${round * 10000} compress`)
}

const compressed = await compress(input)
for (let i = 0; i < 10000; i++) {
  sink ^= (await decompress(compressed))[0]
}
stats('after 10000 decompress')

console.log('done (sink:', sink, ')')
