import { build } from 'esbuild'
import { join, isAbsolute } from 'node:path'
import { readFile, copyFile } from 'node:fs/promises'

let wasmPlugin = {
  name: 'wasm',
  setup(build) {
    // Resolve ".wasm" files to a path with a namespace
    build.onResolve({ filter: /\.wasm$/ }, (args) => {
      // If this is the import inside the stub module, import the
      // binary itself. Put the path in the "wasm-binary" namespace
      // to tell our binary load callback to load the binary file.
      if (args.namespace === 'wasm-stub') {
        return {
          path: args.path,
          namespace: 'wasm-binary',
        }
      }

      // Otherwise, generate the JavaScript stub module for this
      // ".wasm" file. Put it in the "wasm-stub" namespace to tell
      // our stub load callback to fill it with JavaScript.
      //
      // Resolve relative paths to absolute paths here since this
      // resolve callback is given "resolveDir", the directory to
      // resolve imports against.
      if (args.resolveDir === '') {
        return // Ignore unresolvable paths
      }
      return {
        path: isAbsolute(args.path) ? args.path : join(args.resolveDir, args.path),
        namespace: 'wasm-stub',
      }
    })

    // Virtual modules in the "wasm-stub" namespace re-export the raw
    // bytes of the WebAssembly binary as their default export, so the
    // runtime can instantiate them itself. The binary itself is imported
    // from a second virtual module.
    build.onLoad({ filter: /.*/, namespace: 'wasm-stub' }, async (args) => ({
      contents: `import wasm from ${JSON.stringify(args.path)}
        export default wasm`,
    }))

    // Virtual modules in the "wasm-binary" namespace contain the
    // actual bytes of the WebAssembly file. This uses esbuild's
    // built-in "binary" loader instead of manually embedding the
    // binary data inside JavaScript code ourselves.
    build.onLoad({ filter: /.*/, namespace: 'wasm-binary' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'binary',
    }))
  },
}

// WASM compress + decompress

build({
  entryPoints: ['src/wasm.ts'],
  bundle: true,
  target: 'es2022',
  format: 'esm',
  minify: true,
  outfile: 'index.mjs',
  plugins: [wasmPlugin],
}).catch((e) => {
  console.error(e)
  process.exit(1)
})

build({
  entryPoints: ['src/wasm.ts'],
  bundle: true,
  target: 'es2022',
  format: 'cjs',
  minify: true,
  outfile: 'index.cjs',
  plugins: [wasmPlugin],
}).catch((e) => {
  console.error(e)
  process.exit(1)
})

// WASM compress + decompress, external wasm variant (ESM only):
// the .wasm binary is NOT inlined, but referenced as a separate file via
// `new URL('./brotli_wasm_bg.wasm', import.meta.url)`, which bundlers like
// Vite/Rollup emit as a separate asset. This keeps the JS bundle small
// (no 1.8 MB inlined base64 payload).

let externalWasmPlugin = {
  name: 'wasm-external',
  setup(build) {
    build.onResolve({ filter: /\.wasm$/ }, () => ({
      path: 'brotli_wasm_bg.wasm',
      namespace: 'wasm-external',
    }))
    build.onLoad({ filter: /.*/, namespace: 'wasm-external' }, () => ({
      // In Node.js, import.meta.url is a file: URL and undici's fetch()
      // cannot load those, so read the binary from disk instead. In the
      // browser the URL is http(s): and passed through, so bundlers like
      // Vite can emit the .wasm as a regular asset. The fs import uses a
      // computed specifier so browser bundlers don't try to resolve it.
      contents: `const url = new URL('./brotli_wasm_bg.wasm', import.meta.url)
        const fsPromises = 'node:fs/promises'
        export default url.protocol === 'file:'
          ? (await import(fsPromises)).readFile(url).then((b) => new Uint8Array(b))
          : url`,
    }))
  },
}

build({
  entryPoints: ['src/wasm.ts'],
  bundle: true,
  target: 'es2022',
  format: 'esm',
  minify: true,
  outfile: 'index.external.mjs',
  plugins: [externalWasmPlugin],
}).catch((e) => {
  console.error(e)
  process.exit(1)
})

// ship the wasm binary next to the external bundle
copyFile(
  'node_modules/brotli-wasm-custom-dictionary/pkg.web/brotli_wasm_bg.wasm',
  'brotli_wasm_bg.wasm',
).catch((e) => {
  console.error(e)
  process.exit(1)
})

// JS decompress

build({
  entryPoints: ['src/js.ts'],
  bundle: true,
  target: 'es2022',
  minify: true,
  format: 'esm',
  outfile: 'js.mjs',
  //
  plugins: [wasmPlugin],
}).catch((e) => {
  console.error(e)
  process.exit(1)
})

build({
  entryPoints: ['src/js.ts'],
  bundle: true,
  target: 'es2022',
  minify: true,
  format: 'cjs',
  outfile: 'js.cjs',
  //
  plugins: [wasmPlugin],
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
