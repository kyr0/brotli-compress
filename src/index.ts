import { Buffer } from 'buffer'
// @ts-ignore
import init from '../node_modules/brotli-wasm/pkg.bundler/brotli_wasm_bg.wasm'

export const compress = async (input: string | Uint8Array | Buffer, options: any = {}) => {
  await getWasm()
  return compressBrotli(Buffer.from(input), options)
}

export const decompress = async (input: Uint8Array): Promise<Buffer> => {
  await getWasm()
  return Buffer.from(decompressBrotli(input))
}

interface BrotliWasm {
  memory: WebAssembly.Memory
  compress(a: number, b: number, c: number, d: number): void
  decompress(a: number, b: number, c: number): void
  __wbindgen_add_to_stack_pointer(a: number): number
  __wbindgen_malloc(a: number): number
  __wbindgen_free(a: number, b: number): void
  __wbindgen_realloc(a: number, b: number, c: number): number
}

let wasm: BrotliWasm

// @ts-ignore
const getWasm = async (): Promise<BrotliWasm> => {
  if (!wasm) {
    wasm = await init({
      './brotli_wasm_bg.js': {
        __wbindgen_string_new,
        __wbg_stack_0ddaca5d1abfb52f,
        __wbg_new_693216e109162396,
        __wbg_error_09919627ac0992f5,
        __wbindgen_object_drop_ref,
        __wbindgen_rethrow,
        __wbindgen_is_undefined,
        __wbindgen_is_object,
        __wbindgen_json_serialize,
        __wbindgen_throw,
      },
    })
  }
  return wasm
}

const heap = new Array(32).fill(undefined)

heap.push(undefined, null, true, false)

function getObject(idx: number) {
  return heap[idx]
}

const lTextDecoder = TextDecoder

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true })

cachedTextDecoder.decode()

let cachegetUint8Memory0: Uint8Array | null = null
function getUint8Memory0() {
  if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
    cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer)
  }
  return cachegetUint8Memory0
}

function getStringFromWasm0(ptr: number, len: number) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len))
}

let heap_next = heap.length

function addHeapObject(obj: any) {
  if (heap_next === heap.length) heap.push(heap.length + 1)
  const idx = heap_next
  heap_next = heap[idx]

  heap[idx] = obj
  return idx
}

let WASM_VECTOR_LEN = 0

const lTextEncoder = TextEncoder

let cachedTextEncoder = new lTextEncoder()

const encodeString =
  typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg: any, view: any) {
        return cachedTextEncoder.encodeInto(arg, view)
      }
    : function (arg: any, view: any) {
        const buf = cachedTextEncoder.encode(arg)
        view.set(buf)
        return {
          read: arg.length,
          written: buf.length,
        }
      }

function passStringToWasm0(arg: any, malloc: any, realloc: any) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg)
    const ptr = malloc(buf.length)
    getUint8Memory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf)
    WASM_VECTOR_LEN = buf.length
    return ptr
  }

  let len = arg.length
  let ptr = malloc(len)

  const mem = getUint8Memory0()

  let offset = 0

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset)
    if (code > 0x7f) break
    mem[ptr + offset] = code
  }

  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset)
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3))
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len)
    const ret = encodeString(arg, view)

    offset += ret.written ?? 0
  }

  WASM_VECTOR_LEN = offset
  return ptr
}

let cachegetInt32Memory0: Int32Array | null = null
function getInt32Memory0() {
  if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
    cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer)
  }
  return cachegetInt32Memory0
}

function dropObject(idx: number) {
  if (idx < 36) return
  heap[idx] = heap_next
  heap_next = idx
}

function takeObject(idx: number) {
  const ret = getObject(idx)
  dropObject(idx)
  return ret
}

function passArray8ToWasm0(arg: any, malloc: any) {
  const ptr = malloc(arg.length * 1)
  getUint8Memory0().set(arg, ptr / 1)
  WASM_VECTOR_LEN = arg.length
  return ptr
}

let stack_pointer = 32

function addBorrowedObject(obj: any) {
  if (stack_pointer == 1) throw new Error('out of js stack')
  heap[--stack_pointer] = obj
  return stack_pointer
}

function getArrayU8FromWasm0(ptr: number, len: number) {
  return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len)
}

export function compressBrotli(buf: Uint8Array, raw_options: any): Uint8Array {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16)
    var ptr0 = passArray8ToWasm0(buf, wasm.__wbindgen_malloc)
    var len0 = WASM_VECTOR_LEN
    wasm.compress(retptr, ptr0, len0, addBorrowedObject(raw_options))
    var r0 = getInt32Memory0()[retptr / 4 + 0]
    var r1 = getInt32Memory0()[retptr / 4 + 1]
    var v1 = getArrayU8FromWasm0(r0, r1).slice()
    wasm.__wbindgen_free(r0, r1 * 1)
    return v1
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16)
    heap[stack_pointer++] = undefined
  }
}

export function decompressBrotli(buf: Uint8Array): Uint8Array {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16)
    var ptr0 = passArray8ToWasm0(buf, wasm.__wbindgen_malloc)
    var len0 = WASM_VECTOR_LEN
    wasm.decompress(retptr, ptr0, len0)
    var r0 = getInt32Memory0()[retptr / 4 + 0]
    var r1 = getInt32Memory0()[retptr / 4 + 1]
    var v1 = getArrayU8FromWasm0(r0, r1).slice()
    wasm.__wbindgen_free(r0, r1 * 1)
    return v1
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16)
  }
}

function __wbindgen_is_undefined(arg0: number) {
  var ret = getObject(arg0) === undefined
  return ret
}

function __wbindgen_is_object(arg0: number) {
  const val = getObject(arg0)
  var ret = typeof val === 'object' && val !== null
  return ret
}

function __wbindgen_string_new(arg0: any, arg1: any) {
  var ret = getStringFromWasm0(arg0, arg1)
  return addHeapObject(ret)
}

function __wbindgen_json_serialize(arg0: any, arg1: any) {
  const obj = getObject(arg1)
  var ret = JSON.stringify(obj === undefined ? null : obj)
  var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
  var len0 = WASM_VECTOR_LEN
  getInt32Memory0()[arg0 / 4 + 1] = len0
  getInt32Memory0()[arg0 / 4 + 0] = ptr0
}

function __wbg_new_693216e109162396() {
  var ret = new Error()
  return addHeapObject(ret)
}

function __wbindgen_throw(arg0: any, arg1: any) {
  throw new Error(getStringFromWasm0(arg0, arg1))
}

function __wbg_stack_0ddaca5d1abfb52f(arg0: any, arg1: any) {
  var ret = getObject(arg1).stack
  var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
  var len0 = WASM_VECTOR_LEN
  getInt32Memory0()[arg0 / 4 + 1] = len0
  getInt32Memory0()[arg0 / 4 + 0] = ptr0
}

function __wbg_error_09919627ac0992f5(arg0: any, arg1: any) {
  try {
    console.error(getStringFromWasm0(arg0, arg1))
  } finally {
    wasm.__wbindgen_free(arg0, arg1)
  }
}

function __wbindgen_object_drop_ref(arg0: any) {
  takeObject(arg0)
}

function __wbindgen_rethrow(arg0: number) {
  throw takeObject(arg0)
}
