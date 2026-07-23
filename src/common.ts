export interface IBrotliDecompressOptions {
  wasmFileUrl?: string
  customDictionary?: Uint8Array
}

export interface IBrotliCompressOptions {
  quality?: number
  wasmFileUrl?: string
  customDictionary?: Uint8Array
}

export const mapDecompressOptions = (options: IBrotliDecompressOptions): IBrotliDecompressOptions => {
  if (!options) {
    return options
  }

  const optionsMapped: IBrotliDecompressOptions = {}

  if (options.customDictionary) {
    optionsMapped.customDictionary = new Uint8Array(options.customDictionary)
  }

  return optionsMapped
}
