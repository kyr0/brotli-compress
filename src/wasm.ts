import { IBrotliCompressOptions, IBrotliDecompressOptions } from "./common.js"
import init, {compress as runtimeCompress, decompress as runtimeDecompress, CompressStream, DecompressStream} from "./wasmRuntime.js"
import brotliWasm from '../node_modules/brotli-wasm-custom-dictionary/pkg.web/brotli_wasm_bg.wasm'

export { BrotliStreamResultCode } from "./wasmRuntime.js"
export type { BrotliStreamResult } from "./wasmRuntime.js"

// best compression level by default (11)
export const compress = async (input: Uint8Array, options: IBrotliCompressOptions = { quality: 11 }) => {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('compress() expects a Uint8Array — use new TextEncoder().encode(input) for strings')
  }
  await init({ module_or_path: options.wasmFileUrl || brotliWasm })
  return runtimeCompress(input, options)
}

export const decompress = async (input: Uint8Array, options: IBrotliDecompressOptions = { }): Promise<Uint8Array> => {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError('decompress() expects a Uint8Array')
  }
  await init({ module_or_path: options.wasmFileUrl || brotliWasm })
  return runtimeDecompress(input, options)
}

// Streaming compression: feed input chunks via stream.compress(chunk, outputSize)
// and finalize with stream.compress(null, outputSize) until ResultSuccess.
export const createCompressStream = async (options: IBrotliCompressOptions = { quality: 11 }): Promise<CompressStream> => {
  await init({ module_or_path: options.wasmFileUrl || brotliWasm })
  return new CompressStream(options.quality, options.customDictionary)
}

// Streaming decompression: feed compressed chunks via
// stream.decompress(chunk, outputSize) until ResultSuccess.
export const createDecompressStream = async (options: IBrotliDecompressOptions = { }): Promise<DecompressStream> => {
  await init({ module_or_path: options.wasmFileUrl || brotliWasm })
  return new DecompressStream(options.customDictionary)
}
