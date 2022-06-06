# base-unicode

Transcodes `string` and `Uint8Array` (binary) blob data to and from Unicode.
This algorithm allows for character compression as two bytes are usually represented
by one Unicode character in the alphabet, base-unicode uses.

base-unicode therefore allows for a lossless conversion of binary data to and from
Unicode. This is useful for storing binary data in a database, for example but
also for shortening binary data for a text representation that can be copy-pasted.

This again allows e.g. for sharing binary and text data in a character compressed
form that can be easily copied and pasted, for example as a parameter in a URL or
even via twitter.

## Setup

As a package for development (Node.js, Browsers):

```bash
  yarn add base-unicode

  # or

  npm i base-unicode
```

## Usage

The usage in a Node.js or Browser environment is trivial:

```ts
import { encode, decodeToString, decodeToUint8Array } from 'base-unicode'

// encoding + decoding strings
const encoded = encode('Hello, world!') // 1劒碶翚禼誎藝矚h
const decoded = decodeToString(encoded) // Hello, world!

//encoding + decoding binary data
const input = new Uint8Array([0xb, 0xa, 0xb, 0xe]) // a.k.a. [ 11, 10, 11, 14 ]

// you can of course use File, Blob and Buffer as well
const encodedBinary = encode(input) // 0A坘存
const decodedBinary = decodeToUint8Array(encodedBinary) // [ 11, 10, 11, 14 ]
```

## Limitations

The alphabet of `base-unicode` is `21091` characters long. It has been carefully
selected to be supported by the majority of system fonts. The default base-unicode
alphabet consists of the following Unicode character ranges (always upper- and lower-case included):
a-z, α-ω, а-я 一-龯

To make sure that the alphabet is URL-safe and doesn't run into invisible character issues,
all non-printable control characters and none-URL-safe characters are excluded.

However, some fonts don't support all of these characters. To check if your
system supports copying and pasting text that has been encoded with `base-unicde`,
you can simply check the ALPHABET file. If you can spot one character that shows
as a non-renderable square, this algorithm doesn't work on your system.

## Test

    yarn test
