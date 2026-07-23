import { Buffer } from 'buffer'
import { expect, it } from 'vitest'

// @ts-ignore
import { compress, decompress, createCompressStream, createDecompressStream, BrotliStreamResultCode } from '../index'
import { TEST_INPUT } from './__test__/input'
import { DICTIONARY_BASE64, EXPECTED } from './__test__/dictionary'

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

// feeds `input` through a CompressStream in chunks of `chunkSize`,
// using a tiny output buffer to exercise the NeedsMoreOutput path
const streamCompress = async (input: Uint8Array, chunkSize: number, outputSize: number, options?: object): Promise<Uint8Array> => {
  // @ts-ignore
  const stream = await createCompressStream(options)
  const out: Uint8Array[] = []
  let offset = 0
  while (offset < input.byteLength) {
    const res = stream.compress(input.subarray(offset, offset + chunkSize), outputSize)
    out.push(res.buf)
    if (res.code === BrotliStreamResultCode.NeedsMoreOutput) {
      offset += res.input_offset
    } else {
      offset += chunkSize - (input.subarray(offset, offset + chunkSize).byteLength - res.input_offset)
    }
  }
  while (true) {
    const res = stream.compress(null, outputSize)
    out.push(res.buf)
    if (res.code === BrotliStreamResultCode.ResultSuccess) break
  }
  stream.free()
  return concat(out)
}

// feeds `input` through a DecompressStream in chunks of `chunkSize`
const streamDecompress = async (input: Uint8Array, chunkSize: number, outputSize: number, options?: object): Promise<Uint8Array> => {
  // @ts-ignore
  const stream = await createDecompressStream(options)
  const out: Uint8Array[] = []
  let offset = 0
  while (true) {
    const res = stream.decompress(input.subarray(offset, offset + chunkSize), outputSize)
    out.push(res.buf)
    offset += res.input_offset
    if (res.code === BrotliStreamResultCode.ResultSuccess) break
    if (res.code === BrotliStreamResultCode.NeedsMoreInput && offset >= input.byteLength) {
      throw new Error('stream ended before ResultSuccess')
    }
  }
  stream.free()
  return concat(out)
}

it('Streaming compress (chunked, tiny output buffer) round-trips via one-shot decompress', async () => {
  const input = new TextEncoder().encode(TEST_INPUT)
  const compressed = await streamCompress(input, 4096, 256, { quality: 11 })
  const decompressed = await decompress(compressed)
  expect(Buffer.from(decompressed).toString()).toStrictEqual(TEST_INPUT)
})

it('Streaming decompress (chunked, tiny output buffer) of one-shot compressed data', async () => {
  const input = new TextEncoder().encode(TEST_INPUT)
  const compressed = await compress(input, { quality: 11 })
  const decompressed = await streamDecompress(compressed, 512, 4096)
  expect(Buffer.from(decompressed).toString()).toStrictEqual(TEST_INPUT)
})

it('Streaming round-trip with a custom dictionary', async () => {
  const dictionary = new Uint8Array(Buffer.from(DICTIONARY_BASE64, 'base64'))
  const input = new TextEncoder().encode(EXPECTED)
  const compressed = await streamCompress(input, 32, 128, { quality: 11, customDictionary: dictionary })
  const decompressed = await streamDecompress(compressed, 16, 128, { customDictionary: dictionary })
  expect(Buffer.from(decompressed).toString()).toStrictEqual(EXPECTED)
})
