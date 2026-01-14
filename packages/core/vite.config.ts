/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/index.ts',
      },
      name: 'jules-sdk',
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.mjs`,
    },
    rollupOptions: {
      external: [
        // Runtime dependencies (keep bundled for Node, external for Browser if provided by platform)
        'idb',

        // Node.js Built-ins (Bare specifiers)
        '_http_agent',
        '_http_client',
        '_http_common',
        '_http_incoming',
        '_http_outgoing',
        '_http_server',
        '_stream_duplex',
        '_stream_passthrough',
        '_stream_readable',
        '_stream_transform',
        '_stream_wrap',
        '_stream_writable',
        '_tls_common',
        '_tls_wrap',
        'assert',
        'assert/strict',
        'async_hooks',
        'buffer',
        'child_process',
        'cluster',
        'console',
        'constants',
        'crypto',
        'dgram',
        'diagnostics_channel',
        'dns',
        'dns/promises',
        'domain',
        'events',
        'fs',
        'fs/promises',
        'http',
        'http2',
        'https',
        'inspector',
        'inspector/promises',
        'module',
        'net',
        'os',
        'path',
        'path/posix',
        'path/win32',
        'perf_hooks',
        'process',
        'punycode',
        'querystring',
        'readline',
        'readline/promises',
        'repl',
        'stream',
        'stream/consumers',
        'stream/promises',
        'stream/web',
        'string_decoder',
        'sys',
        'timers',
        'timers/promises',
        'tls',
        'trace_events',
        'tty',
        'url',
        'util',
        'util/types',
        'v8',
        'vm',
        'wasi',
        'worker_threads',
        'zlib',

        // Node.js Built-ins (Explicit node: prefix)
        // CRITICAL: These must match the source code imports exactly
        'node:buffer',
        'node:crypto',
        'node:fs',
        'node:fs/promises',
        'node:path',
        'node:process',
        'node:stream',
        'node:timers/promises',
        'node:util',
        'node:os',
      ],
    },
  },
  plugins: [dts()],
});
