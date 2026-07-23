# brotli-compress

This package packages `brotli-wasm-custom-dictionary` (a `brotli-wasm` fork with
custom dictionary support), minifies and inlines it, so that it works consistently
in Node.js and Browser environments. This solves [several issues](https://github.com/rustwasm/wasm-pack/issues/1106) of using `brotli-wasm` directly.

Furthermore, this package comes with two module variants: CommonJS and ESM.
On top of this, this library comes with a copy of the original Brotli `decompress`
implementation by Google, with an optimited API to be 1:1 compatible with
the WASM variant and with TypeScript typing support.

All in all, this package is the Brotli "fire and forget" solution that should
work in all JavaScript environments, with all bundlers and ecosystems, including
Vite, Rollup, Webpack, Gatsby and Next.js projects as well as Node.js.

This library can yield stellar compression rates at byte-level. e.g. 322% in our unit test case:

<img src="jest_results.png" />

If you're looking for even crazier compression rates at "character level", take a look at
my novel algorithm, [`brotli-unicode`](https://github.com/kyr0/brotli-unicode), where the raw Brotli output binary is encoded using
a subset of the Unicode BMP-1 alphabet. It leads to character level compression rates of 500%+.

## Setup

As a package for development (Node.js, Browsers):

```bash
  yarn add brotli-compress

  # or

  npm i brotli-compress
```

## Usage of the WASM variant

The usage in a Node.js or Browser environment is trivial:

```ts
// import size (uncompressed, but minified) / WASM version / max performance: 1.8M
import { compress, decompress } from 'brotli-compress'

const textEncoder = new TextEncoder();
const oneBlockInput = 'Hello🤖!'

// it takes a Uint8Array and returns a Uint8Array
const compressed = await compress(textEncoder.encode(oneBlockInput))

// it takes a Uint8Array and returns a Uint8Array
const decompressed = await decompress(compressed)
const decompressedString = new TextDecoder().decode(decompressed)
```

Please note that the WASM version comes with a whopping size of (minified)
1.8MiB. This is, because the binary is base64 encoded and inlined.

If you prefer maximum performance and memory efficiency over small bundle size,
choose the WASM variant. Also, if you need compression, use the WASM version.

### External WASM variant (small JS bundle)

If the inlined 1.8MiB payload is a problem (e.g. "module too large" bundler
warnings), use the external variant instead. It is the same WASM build with the
same API, but the `.wasm` binary is referenced as a separate file instead of
being inlined — bundlers like Vite/Rollup emit it as a regular asset:

```ts
// import size (uncompressed, but minified): ~13K + separate 1MiB .wasm asset
import { compress, decompress } from 'brotli-compress/external'
```

This variant is ESM-only (there is no CommonJS build of it). With a bundler
(Vite, Rollup, webpack), just use the import above — the `.wasm` file is
emitted as a separate asset automatically. It also works directly in plain
Node.js ESM (the `.wasm` file is read from disk):

```js
// example.mjs
import { compress, decompress } from 'brotli-compress/external'

const compressed = await compress(new TextEncoder().encode('Hello🤖!'))
const decompressed = new TextDecoder().decode(await decompress(compressed))
console.log(decompressed) // Hello🤖!
```

```sh
node example.mjs
```

If you host the `.wasm` file yourself (e.g. on a CDN), you can point any
variant at it with the `wasmFileUrl` option:

```ts
const compressed = await compress(input, { wasmFileUrl: 'https://example.com/brotli_wasm_bg.wasm' })
```

## Usage of the pure JS variant

If you need a small bundle size, can effort the slowdown and
only need decompression, use the hard-written JavaScript decompressor:

```ts
// import size (uncompressed, but minified) / JS version / only decompress / slower: 152K
import { decompress } from 'brotli-compress/js'

// please also note that the pure JS variant is synchronous
// for large inputs, you could optimize the execution by moving
// this call into a Worker

// it takes a Uint8Array and returns a Uint8Array
const decompressed = decompress(compressed)
```

## Encoding to Uint8Array and decoding from Uint8Array

For Node.js, you'd be well advised to use the built-in `Buffer` package:

```ts
import { Buffer } from 'buffer'

const testInput = 'Hello🤖!'
const testInputUint8 = Buffer.from(testInput)
const compressed = await compress(testInputUint8)
const decompressed = await decompress(compressed)
const decompressedString = Buffer.from(decompressed).toString()
```

For use in browser/frontend, you can either use `TextEncoder` and `TextDecoder`
or use a polyfill like the [buffer](https://www.npmjs.com/package/buffer) library.

```ts
new TextEncoder().encode(testInput) // returns a Uint8Array
new TextDecoder().decode(compressed) // returns a string from the compressed Uint8Array
```

## Options

The `compress` method comes with a second `options` parameter.

### Quality level

The most common setting is `quality` with a scale from 0 to 11.
By default, the quality is set to best quality (11).

```ts
const compressed = await compress(Buffer.from('foobar'), { quality: 9 })
```

A lower quality value makes the output bigger but improves compression time.
In 99.9% of the cases, you don't want to change this value.

### Custom dictionary

Both, `compress()` and `decompress()` support a custom dictionary via the
`customDictionary` option (a `Uint8Array` of tokens that are `a priori` known to
appear in the input). This can dramatically shrink the output for small, similar
payloads — e.g. if you know that you'll be compressing TypeScript source code, you
could include the keywords of the TypeScript language in the custom dictionary:

```ts
const customDictionary = new Uint8Array(fs.readFileSync('dictionary.bin'))
const compressed = await compress(input, { quality: 11, customDictionary })
const decompressed = await decompress(compressed, { customDictionary })
```

This uses raw (LZ77) dictionary semantics, exactly like the reference C encoder's
`BrotliEncoderAttachPreparedDictionary(..., BROTLI_SHARED_DICTIONARY_RAW, ...)`,
i.e. the `brotli` CLI's `-D FILE` flag. The dictionary is **not** embedded in the
compressed stream; the decoder must attach the identical dictionary, and
decompression fails loudly without it. Data compressed by the reference CLI with
`-D` can be decompressed here, and vice versa — note that the usable dictionary
size is limited by the window size (at most `2^lgwin - 16` bytes; this package
encodes with the default window, so dictionaries up to ~4 MiB are fully usable).

Custom dictionary support is provided by
[`brotli-wasm-custom-dictionary`](https://github.com/kyr0/brotli-wasm), a fork of
`brotli-wasm` with dictionary support for compression and decompression.
The external WASM variant (`brotli-compress/external`) exposes the exact same
dictionary-capable API; only the way the `.wasm` binary is loaded differs.

Additionally, a handwritten pure-JS decoder is exposed as a separate entry point
(it supports custom dictionaries for decompression as well):

```ts
import { decompress } from 'brotli-compress/js'

const decompressed = decompress(compressed, { customDictionary }) // synchronous
```

## Limitations

There is no streaming compression/decompression yet. It can be simply done by exposing the API from the WASM implementation.
If you need that, pls. ping via Issue.

## Build

    yarn build

## Test

    yarn test

## Licensing

Most of the code of this library is licensed by Apache-2.0.
The original `decompress` implementation is licensed by Google under MIT license (src/js.ts).

## Contibutors

Package and build configuration plus cross-library implementation, documentation and
unit testing, as well as updating the WASM/JS binding has been done by Aron Homberg.

`brotli-wasm` that ships with this package inline as been implemented by [Tim Perry](https://github.com/httptoolkit/brotli-wasm) and contributors.

Direct binding WASM/JS and the respective code extraction idea has been implemented by [stefnotch](https://github.com/stefnotch/url-catpressor/blob/main/src/useCompression.ts)
