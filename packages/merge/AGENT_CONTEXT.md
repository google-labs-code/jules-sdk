# jules-merge — Agent Implementation Context

> **Purpose**: This document is a self-contained briefing for an AI coding agent to implement the `@google/jules-merge` package from scratch. It contains the full specification, codebase conventions, worktree setup instructions, and a file-by-file implementation plan.

---

## 1. Worktree Setup

This work MUST be done in a **git worktree** to avoid interfering with another agent actively working in `packages/fleet` on the main branch.

```bash
cd /Users/deast/google-labs-code/jules-sdk
git worktree add ../jules-sdk-merge feat/jules-merge
cd ../jules-sdk-merge
```

**All file paths below are relative to the worktree root**: `/Users/deast/google-labs-code/jules-sdk-merge/`

After setup, run:
```bash
cd packages/merge
bun install
```

When done, clean up with:
```bash
cd /Users/deast/google-labs-code/jules-sdk
git worktree remove ../jules-sdk-merge
```

---

## 2. Problem Statement

`jules-merge` is a predictive conflict detection and re-baselining coordinator for parallel AI coding agents. Autonomous AI coding sessions run on isolated VM snapshots and cannot execute native Git sync commands. Parallel work across agents frequently causes textual collisions that require human intervention.

`jules-merge` shifts conflict resolution from a post-task Git operation to an in-flight logic puzzle for the LLM. It enforces a cognitive "squash and rebase" directly within the agent's active session prior to PR creation.

### Two Core Workflows

**1. Pre-Push Validation Gate** — executed before creating a PR:
1. Agent invokes validation with repo context and branch targets.
2. Service runs local `git diff` to identify modified files.
3. Service queries GitHub API for remote divergence on those files.
4. Service fetches raw remote file content on divergence.
5. Tool injects remote code as a "Shadow File" into agent context.
6. Agent rewrites logic to accommodate remote state.

**2. CI Failure Fallback** — executed when CI detects a merge conflict:
1. CI detects merge conflict failure.
2. Pipeline runs `format-ci` CLI command.
3. Service parses Git conflict markers from local files.
4. Service generates a standardized task directive.
5. Pipeline routes payload back into agent task queue.

---

## 3. Architecture

Strict **Typed Service Contract** pattern (Spec & Handler). Business logic is fully isolated from transport layers. CLI and MCP server consume the same logic through typed boundaries.

### Pattern Rules
- **Spec** (`spec.ts`): Zod input schemas, error code enums, Result types (success/failure discriminated union), and the capability interface.
- **Handler** (`handler.ts`): Implements the spec interface. Handles all side effects. **NEVER throws** — catches errors and returns structured `Result` objects.
- **Transport layers** (CLI, MCP): Stateless wrappers that parse input, call the handler, and format output.

---

## 4. Codebase Conventions (from `packages/fleet`)

These conventions MUST be followed exactly:

### Build & Runtime
- **Bun** as dependency manager and library builder
- **Node** as runtime target (never use `Bun.*` APIs in library code)
- `build.ts` uses `Bun.build()` with `target: 'node'`, `format: 'esm'`
- Output naming: `[dir]/[name].mjs`
- TypeScript declarations via `tsc --emitDeclarationOnly`

### Package.json Shape
```json
{
  "name": "@google/jules-merge",
  "version": "0.0.1",
  "type": "module",
  "types": "./dist/index.d.ts",
  "bin": { "jules-merge": "./dist/cli/index.mjs" },
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.mjs" },
    "./package.json": "./package.json"
  },
  "files": ["dist/", "README.md"],
  "scripts": {
    "build:js": "bun run build.ts",
    "build:types": "tsc --emitDeclarationOnly --outDir dist",
    "build": "bun run build:js && bun run build:types",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "publishConfig": {
    "registry": "https://wombat-dressing-room.appspot.com",
    "access": "public"
  }
}
```

### TSConfig
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

### Vitest Config
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/__tests__/**/*.test.ts'] },
});
```

### CLI Framework
- Uses `citty` (from `citty` npm package)
- CLI entry point at `src/cli/index.ts`
- Sub-commands are auto-discovered `*.command.ts` files
- Each command file `export default defineCommand({...})`

### Result Helpers
```typescript
// ok helper
export function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

// fail helper
export function fail<TCode extends string>(
  code: TCode,
  message: string,
  recoverable = false,
  suggestion?: string,
): {
  success: false;
  error: { code: TCode; message: string; recoverable: boolean; suggestion?: string };
} {
  return { success: false, error: { code, message, recoverable, suggestion } };
}
```

### License Header
Every `.ts` file starts with:
```typescript
// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
```

### Import Style
- Use `.js` extensions in all relative imports (NodeNext resolution)
- Example: `import { ok } from '../shared/result.js';`

---

## 5. Domain Types (from specification)

These types are the **exact contracts** the implementation must produce. Embed them in the appropriate spec files.

```typescript
export type MergeResolutionStatus = 'clean' | 'conflict';
export type PriorityLevel = 'standard' | 'critical';

export interface RepositoryReference {
  owner: string;
  repo: string;
}

export interface FileConflictDetail {
  filePath: string;
  remoteShadowContent: string;
  conflictReason: string;
}

export interface FileCollisionDetail {
  filePath: string;
  baseCommitSha: string;
  gitConflictMarkers: string;
}

export interface PrePushValidationRequest {
  repository: RepositoryReference;
  baseBranch: string;
  headBranch: string;
}

export interface PrePushValidationResponse {
  status: MergeResolutionStatus;
  message: string;
  conflicts: FileConflictDetail[];
}

export interface CiFailureContextRequest {
  repository: RepositoryReference;
  pullRequestNumber: number;
  failingCommitSha: string;
}

export interface CiFailureContextResponse {
  taskDirective: string;
  priority: PriorityLevel;
  affectedFiles: FileCollisionDetail[];
}
```

---

## 6. File-by-File Implementation Plan

### File Tree
```
packages/merge/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── build.ts
├── AGENT_CONTEXT.md          ← this file
└── src/
    ├── index.ts
    ├── shared/
    │   ├── result.ts
    │   ├── git.ts
    │   └── github.ts
    ├── pre-push/
    │   ├── spec.ts
    │   ├── handler.ts
    │   └── index.ts
    ├── ci-failure/
    │   ├── spec.ts
    │   ├── handler.ts
    │   └── index.ts
    ├── cli/
    │   ├── index.ts
    │   ├── pre-push.command.ts
    │   └── format-ci.command.ts
    ├── mcp/
    │   ├── server.ts
    │   └── index.ts
    └── __tests__/
        ├── pre-push/
        │   ├── spec.test.ts
        │   └── handler.test.ts
        └── ci-failure/
            ├── spec.test.ts
            └── handler.test.ts
```

---

### 6.1 `package.json`

Dependencies:
```json
{
  "dependencies": {
    "@octokit/rest": "^21.0.0",
    "citty": "^0.1.6",
    "zod": "^3.25.0"
  },
  "peerDependencies": {
    "@modelcontextprotocol/sdk": "^1.25.1"
  },
  "peerDependenciesMeta": {
    "@modelcontextprotocol/sdk": { "optional": true }
  },
  "devDependencies": {
    "@modelcontextprotocol/sdk": "^1.25.1",
    "@types/bun": "^1.3.9",
    "@types/node": "^22.15.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

### 6.2 `build.ts`

Bun build script. Two build passes:
1. Library entry: `./src/index.ts`
2. CLI entries: `./src/cli/index.ts` + auto-discovered `./src/cli/*.command.ts`

Externals: `@octokit/rest`, `citty`, `zod`, `@modelcontextprotocol/sdk`

### 6.3 `src/shared/result.ts`

Contains `ok()` and `fail()` helpers (see Section 4). This package is standalone — do NOT import from `@google/jules-fleet`.

### 6.4 `src/shared/git.ts`

Thin wrapper around Node.js `child_process.execFile`. All functions return `Promise<{ ok: true; data: T } | { ok: false; error: string }>`.

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
```

Functions:
- `gitDiffNameOnly(base: string, head: string, cwd?: string): Promise<GitResult<string[]>>`
  - Runs: `git diff ${base}...${head} --name-only`
  - Splits stdout by newline, filters empty
- `gitStatusUnmerged(cwd?: string): Promise<GitResult<string[]>>`
  - Runs: `git status --porcelain`
  - Filters lines starting with `UU `, extracts file paths
- `gitMergeBase(head: string, base: string, cwd?: string): Promise<GitResult<string>>`
  - Runs: `git merge-base ${head} ${base}`
  - Returns trimmed SHA

### 6.5 `src/shared/github.ts`

GitHub API wrapper using `@octokit/rest`.

```typescript
import { Octokit } from '@octokit/rest';

export function createOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN required');
  return new Octokit({ auth: token });
}
```

Functions:
- `compareCommits(octokit, owner, repo, base, head): Promise<string[]>`
  - Uses `octokit.repos.compareCommits()`
  - Returns array of changed file paths (filenames from `data.files`)
  - Catches 403 → rate limit error, 404 → not found error
- `getFileContent(octokit, owner, repo, path, ref): Promise<string>`
  - Uses `octokit.repos.getContent()`
  - Decodes base64 content → UTF-8 string
  - Catches 404 gracefully

### 6.6 `src/pre-push/spec.ts`

```typescript
import { z } from 'zod';

// INPUT
export const PrePushInputSchema = z.object({
  repo: z.string().min(1).refine(
    s => s.includes('/'),
    'Must be in owner/repo format'
  ),
  base: z.string().default('main'),
  head: z.string().min(1),
});
export type PrePushInput = z.infer<typeof PrePushInputSchema>;

// ERROR CODES
export const PrePushErrorCode = z.enum([
  'GIT_DIFF_FAILED',
  'GITHUB_API_ERROR',
  'RATE_LIMIT_EXCEEDED',
  'UNKNOWN_ERROR',
]);
export type PrePushErrorCode = z.infer<typeof PrePushErrorCode>;

// SUCCESS DATA (matches PrePushValidationResponse from domain types)
export interface PrePushData {
  status: 'clean' | 'conflict';
  message: string;
  conflicts: Array<{
    filePath: string;
    conflictReason: string;
    remoteShadowContent: string;
  }>;
}

// RESULT
export interface PrePushSuccess { success: true; data: PrePushData; }
export interface PrePushFailure {
  success: false;
  error: {
    code: PrePushErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}
export type PrePushResult = PrePushSuccess | PrePushFailure;

// INTERFACE
export interface PrePushSpec {
  execute(input: PrePushInput): Promise<PrePushResult>;
}
```

### 6.7 `src/pre-push/handler.ts`

`PrePushHandler implements PrePushSpec`:

```
constructor(octokit: Octokit)
```

`execute()` flow:
1. Split `input.repo` into `{ owner, repo }`.
2. `gitDiffNameOnly(input.base, input.head)` → local changed files.
3. `compareCommits(octokit, owner, repo, input.base, input.head)` → remote changed files.
4. Intersect both sets → `overlappingFiles`.
5. If empty → `ok({ status: 'clean', message: 'No conflicts detected.', conflicts: [] })`.
6. For each overlapping file: `getFileContent(octokit, owner, repo, file, input.base)` → `remoteShadowContent`.
7. Build `FileConflictDetail` objects with `conflictReason: 'Remote commit modified this file since branch creation.'`.
8. Return `ok({ status: 'conflict', message: '...', conflicts })`.
9. Wrap all in try/catch → `fail('UNKNOWN_ERROR', ...)`.

### 6.8 `src/ci-failure/spec.ts`

```typescript
import { z } from 'zod';

export const CiFailureInputSchema = z.object({
  repo: z.string().min(1).refine(s => s.includes('/'), 'Must be in owner/repo format'),
  pullRequestNumber: z.number().int().positive(),
  failingCommitSha: z.string().min(1),
});
export type CiFailureInput = z.infer<typeof CiFailureInputSchema>;

export const CiFailureErrorCode = z.enum([
  'NO_UNMERGED_FILES',
  'GIT_STATUS_FAILED',
  'FILE_READ_FAILED',
  'UNKNOWN_ERROR',
]);
export type CiFailureErrorCode = z.infer<typeof CiFailureErrorCode>;

export interface CiFailureData {
  taskDirective: string;
  priority: 'standard' | 'critical';
  affectedFiles: Array<{
    filePath: string;
    baseCommitSha: string;
    gitConflictMarkers: string;
  }>;
}

export interface CiFailureSuccess { success: true; data: CiFailureData; }
export interface CiFailureFailure {
  success: false;
  error: {
    code: CiFailureErrorCode;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}
export type CiFailureResult = CiFailureSuccess | CiFailureFailure;

export interface CiFailureSpec {
  execute(input: CiFailureInput): Promise<CiFailureResult>;
}
```

### 6.9 `src/ci-failure/handler.ts`

`CiFailureHandler implements CiFailureSpec`:

`execute()` flow:
1. `gitStatusUnmerged()` → list of `UU` file paths.
2. If empty → `fail('NO_UNMERGED_FILES', ...)`.
3. For each file: `fs.readFile(filePath, 'utf-8')`.
4. Extract conflict marker blocks: everything between `<<<<<<<` and `>>>>>>>` (inclusive).
5. `gitMergeBase(input.failingCommitSha, 'HEAD')` → base SHA.
6. Build `FileCollisionDetail[]`.
7. Construct `taskDirective`:
   ```
   MERGE CONFLICT RESOLUTION REQUIRED for PR #${input.pullRequestNumber}.
   Failing commit: ${input.failingCommitSha}.
   ${affectedFiles.length} file(s) have unresolved conflicts.
   Review the gitConflictMarkers for each file and rewrite the code to resolve all conflicts.
   ```
8. Return `ok({ taskDirective, priority: 'critical', affectedFiles })`.

### 6.10 `src/cli/index.ts`

```typescript
#!/usr/bin/env node
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { defineCommand, runMain } from 'citty';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function discoverCommands(): Promise<Record<string, any>> {
  const commands: Record<string, any> = {};
  const files = readdirSync(__dirname).filter(
    f => f.endsWith('.command.ts') || f.endsWith('.command.js') || f.endsWith('.command.mjs'),
  );
  for (const file of files) {
    const name = file.replace(/\.command\.(ts|js|mjs)$/, '');
    const mod = await import(pathToFileURL(join(__dirname, file)).href);
    commands[name] = mod.default;
  }
  return commands;
}

const subCommands = await discoverCommands();

const main = defineCommand({
  meta: {
    name: 'jules-merge',
    version: '0.0.1',
    description: 'Predictive conflict detection for parallel AI agents',
  },
  subCommands,
});

runMain(main);
```

### 6.11 `src/cli/pre-push.command.ts`

```typescript
import { defineCommand } from 'citty';
import { PrePushInputSchema } from '../pre-push/spec.js';
import { PrePushHandler } from '../pre-push/handler.js';
import { createOctokit } from '../shared/github.js';

export default defineCommand({
  meta: { name: 'pre-push', description: 'Validate branch for conflicts before PR creation' },
  args: {
    repo:  { type: 'string', description: 'Repository in owner/repo format', required: true },
    base:  { type: 'string', description: 'Base branch', default: 'main' },
    head:  { type: 'string', description: 'Head branch', required: true },
  },
  async run({ args }) {
    const input = PrePushInputSchema.parse(args);
    const handler = new PrePushHandler(createOctokit());
    const result = await handler.execute(input);
    process.stdout.write(JSON.stringify(result.success ? result.data : result, null, 2) + '\n');
    process.exit(result.success && result.data.status === 'clean' ? 0 : 1);
  },
});
```

### 6.12 `src/cli/format-ci.command.ts`

```typescript
import { defineCommand } from 'citty';
import { CiFailureInputSchema } from '../ci-failure/spec.js';
import { CiFailureHandler } from '../ci-failure/handler.js';

export default defineCommand({
  meta: { name: 'format-ci', description: 'Parse CI merge failure into agent task directive' },
  args: {
    repo: { type: 'string', description: 'Repository in owner/repo format', required: true },
    pr:   { type: 'string', description: 'Pull request number', required: true },
    sha:  { type: 'string', description: 'Failing commit SHA', required: true },
  },
  async run({ args }) {
    const input = CiFailureInputSchema.parse({
      repo: args.repo,
      pullRequestNumber: parseInt(args.pr, 10),
      failingCommitSha: args.sha,
    });
    const handler = new CiFailureHandler();
    const result = await handler.execute(input);
    process.stdout.write(JSON.stringify(result.success ? result.data : result, null, 2) + '\n');
    process.exit(result.success ? 0 : 1);
  },
});
```

### 6.13 `src/mcp/server.ts`

Uses `@modelcontextprotocol/sdk/server`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

Register two tools:

**`validate_branch_for_conflicts`**
- Input: `{ repo: string, base: string, head: string }`
- Parses with `PrePushInputSchema`
- Calls `PrePushHandler.execute()`
- Returns `JSON.stringify(result)` as text content

**`extract_ci_failure_context`**
- Input: `{ repo: string, pullRequestNumber: number, failingCommitSha: string }`
- Parses with `CiFailureInputSchema`
- Calls `CiFailureHandler.execute()`
- Returns `JSON.stringify(result)` as text content

### 6.14 `src/index.ts`

Barrel:
```typescript
export * from './pre-push/index.js';
export * from './ci-failure/index.js';
export * from './shared/result.js';
```

---

## 7. Testing Plan

All tests go in `src/__tests__/`. Run with `bun run test`.

### Contract Tests (spec validation) — table-driven

**`src/__tests__/pre-push/spec.test.ts`**:
- Rejects empty `repo`
- Rejects `repo` without `/`
- Rejects empty `head`
- Defaults `base` to `'main'`
- Accepts valid input

**`src/__tests__/ci-failure/spec.test.ts`**:
- Rejects `pullRequestNumber <= 0`
- Rejects empty `failingCommitSha`
- Rejects `repo` without `/`
- Accepts valid input

### Handler Logic Tests — mocked side effects

**`src/__tests__/pre-push/handler.test.ts`**:
- Mock `shared/git.ts` and `shared/github.ts`
- Test: clean status when no file overlap
- Test: conflict status with shadow content when files overlap
- Test: Git diff failure returns `GIT_DIFF_FAILED` error
- Test: GitHub 403 returns `RATE_LIMIT_EXCEEDED` error

**`src/__tests__/ci-failure/handler.test.ts`**:
- Mock `shared/git.ts` and `node:fs/promises`
- Test: correctly parses conflict markers
- Test: no unmerged files returns `NO_UNMERGED_FILES` error
- Test: file read failure returns `FILE_READ_FAILED` error

---

## 8. Build & Verify Commands

```bash
cd packages/merge

# Install dependencies
bun install

# Build library + types
bun run build

# Type check
bun run typecheck

# Run tests
bun run test
```

---

## 9. CLI Usage Examples

```bash
# Pre-push validation
jules-merge pre-push --repo google-labs-code/jules-sdk --base main --head task/auth-update

# CI failure formatting
jules-merge format-ci --repo google-labs-code/jules-sdk --pr 42 --sha abc123def
```

### Expected Pre-Push Output
```json
{
  "status": "conflict",
  "message": "The remote main branch has advanced. Rebase required for src/auth/middleware.ts.",
  "conflicts": [
    {
      "filePath": "src/auth/middleware.ts",
      "conflictReason": "Remote commit modified this file since branch creation.",
      "remoteShadowContent": "export async function verifyToken(token, options) { ... }"
    }
  ]
}
```

---

## 10. Critical Constraints

1. **Never throw exceptions** in handlers. Return `fail(...)` results.
2. **Never use `Bun.*` APIs** in library/runtime code. Bun is for build and dev scripts only.
3. **Always use `.js` extensions** in relative imports.
4. **Include the Apache 2.0 license header** in every `.ts` file.
5. **Do not modify files outside `packages/merge`** without permission.
6. **Do not import from `@google/jules-fleet`** — this package is standalone.
