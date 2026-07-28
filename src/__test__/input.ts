// Golden default-config compressed form of `TEST_INPUT`: produced once with the
// shipped WASM encoder at the default quality (11) — i.e. `compress(encode(TEST_INPUT))`.
//
// Per SECURITY.md ("nothing is ever removed or behaviour changed") this blob MUST
// stay byte-stable across releases: the release-parity gate asserts every published
// version both reproduces it when compressing and decodes it back to `TEST_INPUT`.
// If the encoder output genuinely must change, that is a deliberate behaviour
// change that requires updating SECURITY.md and this fixture in the same commit.
export const PLAIN_COMPRESSED_BASE64 =
  'G/0CAJwHtq0mvVFgRT6uKI5aYSvJcn2SQkR61bmmmuSlvQcrABWkdJuDn7qpv0BhrOb5pCzsKasHLoHExmTNbZm75nF+PkrYpagpW4I+WeRKxydq98rIP7ESKdua7RHZhh/5x1KCKnUpGkDG/EN7g3bXtYKKtkgoOeZmg3/g5L15ppj9XgxGclg454LrrRU3cIJbK9yXzyKXHEJtfrTwwK4Fm/bz0/ZaA+SvJ6kAMqYTQfcWB+/N8/m5v5WDd4Tr74lqca/pIwD9AA8ADADYx8sdu/IFJo2YFgK47ZUpu93DeomowliW/tlsLEZmDw=='

export const TEST_INPUT = `[BITS 16]
[ORG 0x7c00]

MOV AL, 0x59
MOV AH, 0x0E	   ;Tell BIOS that we need to print one charater on screen.
MOV BH, 0x00	   ;Page no.
MOV BL, 0x07	   ;Text attribute 0x07 is lightgrey font on black background
INT 0x10	       ;Call video interrupt

int3

MOV AL, 0x41
MOV AH, 0x0E	   ;Tell BIOS that we need to print one charater on screen.
MOV BH, 0x00	   ;Page no.
MOV BL, 0x07	   ;Text attribute 0x07 is lightgrey font on black background
INT 0x10	       ;Call video interrupt

int3

MOV AL, 0x59
MOV AH, 0x0E     ;Tell BIOS that we need to print one charater on screen.
MOV BH, 0x00     ;Page no.
MOV BL, 0x07     ;Text attribute 0x07 is lightgrey font on black background
INT 0x10         ;Call video interrupt

jmp $

TIMES 510 - ($ - $$) db 0
DW 0xAA55 ;🤖`
