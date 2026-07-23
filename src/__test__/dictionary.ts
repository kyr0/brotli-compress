// Fixture produced with the reference brotli 1.1.0 encoder:
//   brotli -q 11 -D dictionary.bin -c payload.txt
// The dictionary contains common TypeScript keywords.

export const DICTIONARY_BASE64 =
  'ZnVuY3Rpb24gY29uc3QgcmV0dXJuIGludGVyZmFjZSBzdHJpbmcgbnVtYmVyIGJvb2xlYW4='

export const DICT_COMPRESSED_BASE64 =
  'obAFAGKcrphHo4UHkc4t1Y8EUWe6s5jaCVaq01KQs+WJBqZ9dz0VBA/bjQc2nt2QskzuoyDtOVUehJ0PQhI5d6HNhpIahe8vMF127Vo+771VM0KnCyjYbjMMWAxkqUdzr5xoRkcC'

export const EXPECTED = `function foo(): string {
  const a: number = 1;
  const b: boolean = true;
  return "x";
}
interface Bar {
  value: string;
  flag: boolean;
}
function baz(): number {
  return 42;
}
`
