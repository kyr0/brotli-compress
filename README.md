# brotli-compress

This package packages `brotli-wasm`, minifies and inlines it, so that it works consistently
in Node.js and Browser environments. This solves [several issues](https://github.com/rustwasm/wasm-pack/issues/1106) of using `brotli-wasm` directly.

Furthermore, this package comes with two module variants: CommonJS and ESM.
On top of this, this library comes with a copy of the original Brotli `decompress`
implementation by Google, with an optimited API to be 1:1 compatible with
the WASM variant and with TypeScript typing support.

All in all, this package is the Brotli "fire and forget" solution that should
work in all JavaScript environments, with all bundlers and ecosystems, including
Vite, Rollup, Webpack, Gatsby and Next.js projects as well as Node.js.

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

const oneBlockInput = 'Hello🤖!'

// it takes a Int8Array and returns a Int8Array
const compressed = await compress(oneBlockInput)

// it takes a Int8Array and returns a Int8Array
const decompressed = await decompress(compressed)
```

Please note that the WASM version comes with a whopping size of (minified)
1.8MiB. This is, because the binary is base64 encoded and inlined.

If you prefer maximum performance and memory efficiency over small bundle size,
choose the WASM variant. Also, if you need compression, use the WASM version.

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

The relevant options here is `customDictionary`. You can set this to an Uint8Array string
of tokens which should be part of the `a priori` known dictionary. This can be useful
if you have power over both, the sender and the receiver part and if you know exactly
which tokens will be used alot in the input. For example, if you know that you'll
be compressing text, encoded as UTF16/UCS-2 and you know that the content is TypeScript code,
you could include the keywords of the TypeScript language in the custom dictionary.

Please mind, that you need to set the same value for decoding as well.

```ts
// with this configuration, "let" must not be encoded in the dictionary and carried as part of the
// payload. The binary tree (huffman coding tree)
const customDictionary = Buffer.from('let')
const compressed = await compress('let foo = 123; let bar = "foo";', { customDictionary })
const decompressed = await decompress(compressed, { customDictionary })
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
