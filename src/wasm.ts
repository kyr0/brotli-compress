import { IBrotliCompressOptions, IBrotliDecompressOptions } from "./common.js"
import init, {compress as runtimeCompress, decompress as runtimeDecompress} from "./wasmRuntime.js"
import brotliWasm from '../node_modules/brotli-wasm-custom-dictionary/pkg.web/brotli_wasm_bg.wasm'

// best compression level by default (11)
export const compress = async (input: Uint8Array, options: IBrotliCompressOptions = { quality: 11 }) => {
  await init({ module_or_path: options.wasmFileUrl || brotliWasm })
  return runtimeCompress(input, options)
}

export const decompress = async (input: Uint8Array, options: IBrotliDecompressOptions = { }): Promise<Uint8Array> => {
  await init({ module_or_path: options.wasmFileUrl || brotliWasm })
  return runtimeDecompress(input, options)
}
