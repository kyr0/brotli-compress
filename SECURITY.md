# Security Policy

## Supported Versions

This library remains API compatible and regression-free.
Methods and options might be added, but nothing is ever removed or behaviour
changed. Therefore - feel free to update to the latest version - the latest is
the greatest.

## Release-parity gate

The promise above is **enforced, not just documented**. Before every publish,
`npm run gate` ([`scripts/release-gate/`](scripts/release-gate/release-gate.ts))
packs the upcoming release, downloads the latest published version, and proves
they are import- and behaviour-identical by re-running the test suite against
both installed tarballs and by asserting byte-for-byte equal output for every
compress/decompress configuration encoded in the tests (across the `.`, `/js`
and `/external` entry points, in both ESM and CJS). It hard-fails on:

- any **removed** shipped import file, `exports` subpath, ESM/CJS condition, or
  exported symbol;
- any **byte drift** in a known compress/decompress configuration;
- the upcoming test suite (re-run against the installed tarball) not passing.

A **documented**, intentional behaviour change (listed in
[`scripts/release-gate/known-drift.json`](scripts/release-gate/known-drift.json)
and under "Documented behaviour changes" below) is reported as *acknowledged
drift* rather than a failure — strict for everything else, with a visible audit
trail.

`npm publish` is gated via the `prepublishOnly` hook. To ship an **intentional**
behaviour change (e.g. a correctness fix), bump the version, record it below,
and publish once with `npm run release` (which builds and bypasses the gate for
this one acknowledged change); the gate then re-baselines against the newly
published version and goes green again for subsequent releases.

## Documented behaviour changes

- **2.2.2** — pure-JS decoder correctness fix (RFC 7932 §4): the distance ring
  buffer is now updated for compound dictionary references only when the distance
  code is non-zero. This changes the *decoded output* of `brotli-compress/js`
  `decompress()` for inputs compressed with a custom dictionary that reuse the
  last distance code (previously such streams could decode incorrectly). The WASM
  variant is unaffected. This is the single, intentional exception to the
  "no behaviour change" rule above; the release gate guards all future releases.

## Reporting a Vulnerability

Please use the private security disclosure option, Github offers.
