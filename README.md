# brotli-compress

This package is a re-packaging of `brotli-wasm` that works consistently
in Node.js and Browser environments. The WASM module has been bundled in
and inlined as base64 encoded binary data; therfore it doesn't need to be
loaded from a separate file. This solves the following issue with `wasm-pack`:

- https://github.com/rustwasm/wasm-pack/issues/1106

Furthermore, the build script used in this package bundles in different
output variants: CommonJS and ESM. On top of this, the library uses the
`buffer` package internally to polyfill the missing implementation in
Browser environments.

This makes the package easier to use with other bundlers like Vite,
Rollup, Webpack, etc. and leads to a seamless integration e.g. into
Gatsby and Next.js projects.

## Setup

As a package for development (Node.js, Browsers):

```bash
  yarn add brotli-compress

  # or

  npm i brotli-compress
```

## Usage

The usage in a Node.js or Browser environment is trivial:

```ts
import { compress, decompress } from 'brotli-compress'

const oneBlockInput = 'Hello🤖!'
const compressed = await compress(oneBlockInput)
const decompressed = await decompress(compressed)
```

## Options

Compress comes with an options object as a second parameter:

```ts
const compressed = await compress('foobar', { quality: 12 })
```

The only option known to me at the moment is `quality`.

## Limitations

I'm planning to add Stream compression as well and add all
the unit tests of the original package.

## Roadmap

It might be wise to remove the `buffer` library and replace
it with TextEncoder and TextDecoder in browser environments.

## Build

yarn build

## Test

    yarn test
