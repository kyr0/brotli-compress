import * as brotliPromise from 'brotli-wasm'
import { Buffer } from 'buffer'

export const compress = async (input: string | Uint8Array | Buffer) =>
  (await brotliPromise).compress(Buffer.from(input))

export const decompress = async (input: Uint8Array): Promise<Buffer> =>
  Buffer.from((await brotliPromise).decompress(input))
