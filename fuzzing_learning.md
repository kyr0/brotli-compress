# Fuzzing learnings: WASM encoder panic with custom dictionaries

Findings from fuzzing `brotli-compress` (round-tripping WASM encoder output
through the WASM decoder, the pure-JS decoder, and Node's `zlib` as ground
truth). One hard encoder bug was found. This document contains everything
needed to reproduce and fix it in the upstream Rust code.

## TL;DR

`compress()` **panics** (Rust `index out of bounds`, surfaced in JS as
`RuntimeError: unreachable`) for certain inputs when a `customDictionary` is
attached, at qualities 5–9. Root cause: a `Command` with an effective copy
length **< 2** reaches the bitstream writer, and
`GetCopyLengthCode(copylen)` underflows on `copylen - 2`, producing index
`65535` into a 24-entry lookup table.

The bug is **not** in the wasm-bindgen glue of `kyr0/brotli-wasm` — the glue
simply calls `brotli::enc::BrotliCompressCustomIoCustomDict` from the stock
crates.io `brotli` crate (version **8.0.4**). The bug is almost certainly
reproducible natively in the crate's custom-dictionary compression path, no
WASM involved.

## The panic

```
panicked at .../brotli-8.0.4/src/enc/brotli_bit_stream.rs:1940:5:
index out of bounds: the len is 24 but the index is 65535
```

Mechanics (all line numbers from `brotli` crate 8.0.4):

- `brotli_bit_stream.rs:1940` is `GetCopyBase(copycode)` → `kCopyBase[copycode]`
  (`kCopyBase` has 24 entries), called from `StoreCommandExtra`.
- `copycode` comes from `GetCopyLengthCode(cmd.copy_len_code())`
  (`src/enc/command.rs:91`):

  ```rust
  pub fn GetCopyLengthCode(copylen: usize) -> u16 {
      if copylen < 10usize {
          copylen.wrapping_sub(2) as u16   // copylen == 1 -> 65535, copylen == 0 -> 65534
      } ...
  }
  ```

  The function assumes the brotli invariant **copy length >= 2** (copy code 0
  encodes length 2). For `copylen` 0 or 1 it silently wraps to 65534/65535
  instead of failing loudly.
- `Command::copy_len_code()` (`brotli_bit_stream.rs:1925`) is the packed
  copy length plus a signed "delta" stored in the high bits by
  `Command::init` (`src/enc/command.rs:283`):
  `copy_len_ = copylen | ((copylen_code - copylen) << 25)`.

So the encoder generated a backward reference whose length-code-adjusted copy
length is 0 or 1 — invalid in brotli — and only with a custom dictionary
attached. The panic is a *trap*, not a returned `Err`, so the JS API cannot
turn it into the friendly `"Brotli compress failed: ..."` error.

## Minimal reproduction

- payload (23 bytes, ASCII): `42ringbaznumberbar 42ba`
- dictionary (13 bytes, ASCII, **note the trailing space**): `ingr boolean `
- panics at qualities **7, 8, 9** (fresh process per run; see "WASM instance
  poisoning" below). q0–q6 and q10–q11 succeed on this input.

Larger inputs widen the affected range: the original fuzz find (a 1001-byte
payload of random keyword tokens, 216-byte dictionary) panics at q5–q9.

### JS repro (via this package)

```js
import { compress } from 'brotli-compress'

const payload = new TextEncoder().encode('42ringbaznumberbar 42ba')
const dict = new TextEncoder().encode('ingr boolean ') // trailing space matters

await compress(payload, { quality: 9, customDictionary: dict })
// -> RuntimeError: unreachable
//    panicked at brotli-8.0.4/src/enc/brotli_bit_stream.rs:1940:5:
//    index out of bounds: the len is 24 but the index is 65535
```

### Native Rust repro sketch (stock `brotli` crate 8.0.4, no WASM)

The fork's `compress` does exactly this when `customDictionary` is set
(see `src/lib.rs` in `kyr0/brotli-wasm`):

```rust
let payload = b"42ringbaznumberbar 42ba";
let dict = b"ingr boolean "; // trailing space matters

let mut out = Vec::new();
let mut params = brotli::enc::BrotliEncoderParams::default();
params.quality = 9;

let mut input_buffer = [0u8; 4096];
let mut output_buffer = [0u8; 4096];
let mut nop_callback = |_data: &mut brotli::interface::PredictionModeContextMap<
    brotli::interface::InputReferenceMut>,
    _cmds: &mut [brotli::interface::StaticCommand],
    _mb: brotli::interface::InputPair,
    _mfv: &mut brotli::enc::StandardAlloc| ();

brotli::enc::BrotliCompressCustomIoCustomDict(
    &mut brotli::IoReaderWrapper(&mut &payload[..]),
    &mut brotli::IoWriterWrapper(&mut out),
    &mut input_buffer[..],
    &mut output_buffer[..],
    &params,
    brotli::enc::StandardAlloc::default(),
    &mut nop_callback,
    dict,
    std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Unexpected EOF"),
).unwrap();
```

If this does not panic natively, the difference vs. the published wasm binary
(build flags, exact crate revision) needs checking; the wasm binary was built
from `brotli` 8.0.4 per the panic path.

## Trigger characterization

Measured with the minimized input, each quality in a **fresh** process:

| quality | result |
|---|---|
| 0–6 | ok |
| 7, 8, 9 | **panic** |
| 10, 11 | ok |

With the original (unminimized) 1001-byte payload: q0–q4 ok, **q5–q9 panic**,
q10–q11 ok.

Other observations:

- The dictionary is required. The same payloads without `customDictionary`
  never panic at any quality (0/72 fuzz failures on the no-dictionary path).
- Even a 54-byte dictionary triggers it; dictionary content matters (the
  bytes above are minimized, arbitrary dictionaries mostly work fine).
- Quality correlation matches the encoder internals: q5–q9 build meta-blocks
  via `BrotliBuildMetaBlock` (hash-chain backward references over the
  ring buffer that now includes the prepended dictionary), while q10/q11 use
  the "root" meta-block builder with prior evaluation and q0–q4 use fast
  one-pass fragment paths. The dictionary is prepended to the ring buffer by
  `set_custom_dictionary` → `HasherPrependCustomDictionary`
  (`src/enc/encode.rs:1163`), so the backward-reference search in the q5–q9
  path is the prime suspect.

## Where to look for the root cause (brotli crate 8.0.4)

The invariant "every emitted `Command` has `copy_len_code() >= 2`" is violated
somewhere between backward-reference generation and `StoreMetaBlock`. Places
that create or mutate `copy_len_`:

- `Command::init` — `src/enc/command.rs:283`: packs
  `copylen | ((copylen_code - copylen) << 25)`. If a caller passes
  `copylen = 2, copylen_code = 1` (or any combo where
  `copylen + delta < 2`), the underflow is baked in. Audit callers in the
  q5–q9 meta-block path for dictionary-derived matches — a match found at a
  dictionary position may go through different length-code adjustment than a
  normal match.
- `src/enc/encode.rs:386` — `extend_last_command`: extends
  `last_command.copy_len_ += 1` while matching against the ring buffer (which
  includes the prepended dictionary), then recomputes the length code from
  `(copy_len_ & 0x01ff_ffff) + (copy_len_ >> 25)`. Worth checking its
  distance/`max_distance` bookkeeping when `last_processed_pos_` starts at
  `dict_size` instead of 0 — that offset exists **only** in the
  custom-dictionary path, which fits the trigger perfectly.
- `src/enc/command.rs:375` — a `cmd.copy_len_ = 3` fixup; check it can't run
  on a command whose packed delta then pushes the effective length below 2.

A direct way to pin it down: run the native repro under a debug build and dump
`num_commands_`/`commands_` (insert, copy_len, copy_len_code, dist) right
before `StoreMetaBlock`/`StoreCommandExtra` for the failing input; the
offending command will have `copy_len_code() < 2`.

Defensive hardening regardless of the root cause: make
`GetCopyLengthCode(0 | 1)`/`GetInsertLengthCode` return an error (or assert in
debug builds) instead of wrapping to 65534/65535 — the current
`wrapping_sub(2)` turns an encoder-logic bug into an unhelpful index-out-of-
bounds panic far from its origin.

## Secondary observation: WASM instance poisoning

While minimizing, a single trapped `compress()` left the whole module
instance broken — every *subsequent* call in the same process failed, even
inputs that succeed in a fresh process. Fuzz/minimize with one process per
candidate (or catch and re-init). It may also be worth making the JS wrapper
re-instantiate the module after a trap, since one bad input currently DoSes
the process's encoder for good.

## What is NOT affected

- **Decompression** (WASM and pure-JS): 250-case fuzz across qualities 1–11,
  40 B–150 KB payloads, with/without dictionaries, one-shot and streaming:
  0 mismatches. Streams the encoder does produce are valid and decode
  correctly everywhere (Node `zlib` agrees).
- Compression without `customDictionary` at any quality.
