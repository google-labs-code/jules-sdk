# jules-merge — Agent Implementation Context

> **Purpose**: This document is a self-contained briefing for an AI coding agent to implement the `@google/jules-merge` package from scratch. It contains the full specification, codebase conventions, worktree setup instructions, and a file-by-file implementation plan structured as a Red-Green-Refactor workflow.

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
1. Agent invokes validation with session ID, repo context, and branch targets.
2. Service queries the Jules session (via `@google/jules-sdk`) to identify modified files.
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

### Pattern Rules (from [TSC Skill](https://raw.githubusercontent.com/davideast/stitch-mcp/refs/heads/main/.gemini/skills/typed-service-contract/skill.md))
- **Spec** (`spec.ts`): Zod input schema ("Parse, don't validate"), Zod error code enum (exhaustive), Result discriminated union (Success | Failure), and capability Interface.
- **Handler** (`handler.ts`): Implements the spec interface. An "impure" class handling all side effects. **NEVER throws** — catches errors and returns structured `Result` objects.
- **Transport layers** (CLI, MCP): Stateless wrappers that parse input, call the handler, and format output.

### Testing Rules
Tests are split into two categories. Do NOT write monolithic tests.
- **Contract Tests** (spec): Test the bouncer — validate schema edge cases, Zod refinements, defaults. Table-driven style.
- **Logic Tests** (handler): Test the chef — mock external dependencies, assert Result objects. Mocked unit test style.

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

### Dependencies
```json
{
  "dependencies": {
    "@google/jules-sdk": "workspace:*",
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
  sessionId: string;
  repository: RepositoryReference;
  baseBranch: string;
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

## 6. File Tree

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
    │   ├── session.ts        ← Jules SDK session file detection
    │   ├── git.ts            ← CI failure path only
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
        ├── shared/
        │   ├── session.test.ts
        │   ├── github.test.ts
        │   └── git.test.ts
        ├── pre-push/
        │   ├── spec.test.ts
        │   └── handler.test.ts
        └── ci-failure/
            ├── spec.test.ts
            └── handler.test.ts
```

---

## 7. Development Workflow: Red-Green-Refactor

Implementation follows a strict **traffic light** TDD cycle. Before each feature slice, start `bunx vitest --watch` and keep it running.

| Phase | Color | What Happens |
|-------|-------|--------------|
| 🔴 **RED** | Write failing tests first | Define expected behavior via test cases. `bun run test` → all new tests fail. |
| 🟢 **GREEN** | Write minimum code to pass | Implement the spec/handler/utility. `bun run test` → all tests pass. |
| 🟡 **REFACTOR** | Clean up | Remove duplication, improve naming, verify `bun run typecheck`. No new behavior. |

### Execution Sequence

```
Phase 1: Foundation (no tests needed)
  → package.json, tsconfig.json, vitest.config.ts, build.ts
  → src/shared/result.ts (ok/fail helpers)

Phase 2: Shared Utilities
  Slice 2a: src/shared/session.ts (Jules SDK wrapper)
    🔴 Write src/__tests__/shared/session.test.ts
    🟢 Implement src/shared/session.ts
    🟡 Refactor
  Slice 2b: src/shared/github.ts (Octokit wrapper)
    🔴 Write src/__tests__/shared/github.test.ts
    🟢 Implement src/shared/github.ts
    🟡 Refactor
  Slice 2c: src/shared/git.ts (CI-only git helpers)
    🔴 Write src/__tests__/shared/git.test.ts
    🟢 Implement src/shared/git.ts
    🟡 Refactor

Phase 3: Pre-Push Feature
  Slice 3a: Contract
    🔴 Write src/__tests__/pre-push/spec.test.ts
    🟢 Implement src/pre-push/spec.ts
    🟡 Refactor
  Slice 3b: Logic
    🔴 Write src/__tests__/pre-push/handler.test.ts
    🟢 Implement src/pre-push/handler.ts + src/pre-push/index.ts
    🟡 Refactor

Phase 4: CI-Failure Feature
  Slice 4a: Contract
    🔴 Write src/__tests__/ci-failure/spec.test.ts
    🟢 Implement src/ci-failure/spec.ts
    🟡 Refactor
  Slice 4b: Logic
    🔴 Write src/__tests__/ci-failure/handler.test.ts
    🟢 Implement src/ci-failure/handler.ts + src/ci-failure/index.ts
    🟡 Refactor

Phase 5: Transport + Barrel (thin wrappers, no business logic)
  → src/cli/index.ts, pre-push.command.ts, format-ci.command.ts
  → src/mcp/server.ts, src/mcp/index.ts
  → src/index.ts (barrel)

Phase 6: Final Verification
  → bun run build
  → bun run typecheck
  → bun run test (all green)
```

---

## 8. File-by-File Implementation Plan

### 8.1 `build.ts`

Bun build script. Two build passes:
1. Library entry: `./src/index.ts`
2. CLI entries: `./src/cli/index.ts` + auto-discovered `./src/cli/*.command.ts`

Externals: `@google/jules-sdk`, `@octokit/rest`, `citty`, `zod`, `@modelcontextprotocol/sdk`

### 8.2 `src/shared/result.ts`

Contains `ok()` and `fail()` helpers (see Section 4). This package is standalone — do NOT import from `@google/jules-fleet`.

### 8.3 `src/shared/session.ts`

Jules SDK wrapper for dual-mode session file detection. Modeled after `packages/mcp/src/functions/code-review.ts`.

```typescript
import { type JulesClient, type ChangeSetArtifact, type Activity } from '@google/jules-sdk';

export interface SessionFileInfo {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
}

/**
 * Get the list of files changed in a Jules session.
 *
 * Dual-mode:
 * - If session is busy (in-progress): aggregates changeSet artifacts from activities
 * - If session is stable (completed): uses the session outcome's changeSet
 */
export async function getSessionChangedFiles(
  client: JulesClient,
  sessionId: string,
): Promise<SessionFileInfo[]> {
  const session = client.session(sessionId);
  await session.activities.hydrate();
  const snapshot = await session.snapshot();

  const isBusy = isBusyState(snapshot.state);

  if (isBusy) {
    return aggregateFromActivities(snapshot.activities ?? []);
  }

  // Stable: use outcome changeSet
  const changeSet = typeof snapshot.changeSet === 'function'
    ? (snapshot.changeSet() as ChangeSetArtifact | undefined)
    : undefined;

  if (!changeSet) return [];
  const parsed = changeSet.parsed();
  return parsed.files.map(f => ({ path: f.path, changeType: f.changeType }));
}

function isBusyState(state: string): boolean {
  const busy = new Set(['queued', 'planning', 'inProgress', 'in_progress']);
  return busy.has(state);
}

function aggregateFromActivities(activities: readonly Activity[]): SessionFileInfo[] {
  const fileMap = new Map<string, {
    firstChangeType: 'created' | 'modified' | 'deleted';
    latestChangeType: 'created' | 'modified' | 'deleted';
  }>();

  for (const activity of activities) {
    for (const artifact of activity.artifacts) {
      if (artifact.type === 'changeSet') {
        const parsed = (artifact as ChangeSetArtifact).parsed();
        for (const file of parsed.files) {
          const existing = fileMap.get(file.path);
          if (existing) {
            existing.latestChangeType = file.changeType;
          } else {
            fileMap.set(file.path, {
              firstChangeType: file.changeType,
              latestChangeType: file.changeType,
            });
          }
        }
      }
    }
  }

  const result: SessionFileInfo[] = [];
  for (const [path, info] of fileMap) {
    // created → deleted = net no change, skip
    if (info.firstChangeType === 'created' && info.latestChangeType === 'deleted') continue;
    const netType = info.firstChangeType === 'created' ? 'created' : info.latestChangeType;
    result.push({ path, changeType: netType });
  }
  return result;
}

/**
 * Create a JulesClient from environment.
 * Expects JULES_API_KEY to be set.
 */
export { jules as createJulesClient } from '@google/jules-sdk';
```

### 8.4 `src/shared/git.ts`

Thin wrapper around Node.js `child_process.execFile`. Used **only** by the CI failure handler.

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
```

Functions:
- `gitStatusUnmerged(cwd?: string): Promise<GitResult<string[]>>`
  - Runs: `git status --porcelain`
  - Filters lines starting with `UU `, extracts file paths
- `gitMergeBase(head: string, base: string, cwd?: string): Promise<GitResult<string>>`
  - Runs: `git merge-base ${head} ${base}`
  - Returns trimmed SHA

All functions return `Promise<{ ok: true; data: T } | { ok: false; error: string }>`.

### 8.5 `src/shared/github.ts`

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

### 8.6 `src/pre-push/spec.ts`

```typescript
import { z } from 'zod';

// INPUT
export const PrePushInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  repo: z.string().min(1).refine(
    s => s.includes('/'),
    'Must be in owner/repo format'
  ),
  base: z.string().default('main'),
});
export type PrePushInput = z.infer<typeof PrePushInputSchema>;

// ERROR CODES
export const PrePushErrorCode = z.enum([
  'SESSION_QUERY_FAILED',
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

### 8.7 `src/pre-push/handler.ts`

`PrePushHandler implements PrePushSpec`:

```
constructor(octokit: Octokit, julesClient: JulesClient)
```

`execute()` flow:
1. Split `input.repo` into `{ owner, repo }`.
2. `getSessionChangedFiles(julesClient, input.sessionId)` → session changed files.
3. `compareCommits(octokit, owner, repo, input.base, 'HEAD')` → remote changed files.
4. Intersect session file paths with remote set → `overlappingFiles`.
5. If empty → `ok({ status: 'clean', message: 'No conflicts detected.', conflicts: [] })`.
6. For each overlapping file: `getFileContent(octokit, owner, repo, file, input.base)` → `remoteShadowContent`.
7. Build `FileConflictDetail` objects with `conflictReason: 'Remote commit modified this file since branch creation.'`.
8. Return `ok({ status: 'conflict', message: '...', conflicts })`.
9. Wrap all in try/catch → `fail('UNKNOWN_ERROR', ...)`.

### 8.8 `src/ci-failure/spec.ts`

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

### 8.9 `src/ci-failure/handler.ts`

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

### 8.10 `src/cli/index.ts`

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

### 8.11 `src/cli/pre-push.command.ts`

```typescript
import { defineCommand } from 'citty';
import { PrePushInputSchema } from '../pre-push/spec.js';
import { PrePushHandler } from '../pre-push/handler.js';
import { createOctokit } from '../shared/github.js';
import { createJulesClient } from '../shared/session.js';

export default defineCommand({
  meta: { name: 'pre-push', description: 'Validate session for conflicts before PR creation' },
  args: {
    session: { type: 'string', description: 'Jules session ID', required: true },
    repo:  { type: 'string', description: 'Repository in owner/repo format', required: true },
    base:  { type: 'string', description: 'Base branch', default: 'main' },
  },
  async run({ args }) {
    const input = PrePushInputSchema.parse({
      sessionId: args.session,
      repo: args.repo,
      base: args.base,
    });
    const handler = new PrePushHandler(createOctokit(), createJulesClient);
    const result = await handler.execute(input);
    process.stdout.write(JSON.stringify(result.success ? result.data : result, null, 2) + '\n');
    process.exit(result.success && result.data.status === 'clean' ? 0 : 1);
  },
});
```

### 8.12 `src/cli/format-ci.command.ts`

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

### 8.13 `src/mcp/server.ts`

Uses `@modelcontextprotocol/sdk/server`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

Register two tools:

**`validate_branch_for_conflicts`**
- Input: `{ sessionId: string, repo: string, base: string }`
- Parses with `PrePushInputSchema`
- Calls `PrePushHandler.execute()`
- Returns `JSON.stringify(result)` as text content

**`extract_ci_failure_context`**
- Input: `{ repo: string, pullRequestNumber: number, failingCommitSha: string }`
- Parses with `CiFailureInputSchema`
- Calls `CiFailureHandler.execute()`
- Returns `JSON.stringify(result)` as text content

### 8.14 `src/index.ts`

Barrel:
```typescript
export * from './pre-push/index.js';
export * from './ci-failure/index.js';
export * from './shared/result.js';
export * from './shared/session.js';
```

---

## 9. Testing Plan (RGR Test Cases)

All tests go in `src/__tests__/`. Run with `bun run test` or `bunx vitest --watch`.

### Phase 2a: `src/__tests__/shared/session.test.ts`

**Logic Tests** — mock `@google/jules-sdk`:
- Busy session: aggregates files from activity changeSet artifacts
- Stable session: uses outcome changeSet
- `created → deleted` net change is omitted
- `created → modified` stays as `created`
- Empty session (no activities, no changeSet) returns `[]`

### Phase 2b: `src/__tests__/shared/github.test.ts`

**Logic Tests** — mock `@octokit/rest`:
- `compareCommits` returns file paths from diff
- `compareCommits` handles 403 (rate limit)
- `compareCommits` handles 404 (not found)
- `getFileContent` decodes base64 content
- `getFileContent` handles 404 gracefully

### Phase 2c: `src/__tests__/shared/git.test.ts`

**Logic Tests** — mock `child_process.execFile`:
- `gitStatusUnmerged` parses `UU` lines from porcelain output
- `gitStatusUnmerged` returns empty array when no conflicts
- `gitMergeBase` returns trimmed SHA

### Phase 3a: `src/__tests__/pre-push/spec.test.ts`

**Contract Tests** — table-driven:
- Rejects empty `sessionId`
- Rejects empty `repo`
- Rejects `repo` without `/`
- Defaults `base` to `'main'`
- Accepts valid input

### Phase 3b: `src/__tests__/pre-push/handler.test.ts`

**Logic Tests** — mock `shared/session.ts` and `shared/github.ts`:
- Clean status when no file overlap between session and remote
- Conflict status with shadow content when files overlap
- Session query failure returns `SESSION_QUERY_FAILED` error
- GitHub 403 returns `RATE_LIMIT_EXCEEDED` error
- Busy session (in-progress) returns files from activity aggregation

### Phase 4a: `src/__tests__/ci-failure/spec.test.ts`

**Contract Tests** — table-driven:
- Rejects `pullRequestNumber <= 0`
- Rejects empty `failingCommitSha`
- Rejects `repo` without `/`
- Accepts valid input

### Phase 4b: `src/__tests__/ci-failure/handler.test.ts`

**Logic Tests** — mock `shared/git.ts` and `node:fs/promises`:
- Correctly parses conflict markers
- No unmerged files returns `NO_UNMERGED_FILES` error
- File read failure returns `FILE_READ_FAILED` error

---

## 10. Build & Verify Commands

```bash
cd packages/merge

# Install dependencies
bun install

# Start test watcher (keep running during development)
bunx vitest --watch

# Build library + types
bun run build

# Type check
bun run typecheck

# Run tests (one-shot)
bun run test
```

---

## 11. CLI Usage Examples

```bash
# Pre-push validation
jules-merge pre-push --session abc123 --repo google-labs-code/jules-sdk --base main

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

## 12. Critical Constraints

1. **Never throw exceptions** in handlers. Return `fail(...)` results.
2. **Never use `Bun.*` APIs** in library/runtime code. Bun is for build and dev scripts only.
3. **Always use `.js` extensions** in relative imports.
4. **Include the Apache 2.0 license header** in every `.ts` file.
5. **Do not modify files outside `packages/merge`** without permission.
6. **Do not import from `@google/jules-fleet`** — this package is standalone.
7. **Require `JULES_API_KEY`** environment variable for pre-push validation.
8. **Follow Red-Green-Refactor**: write tests BEFORE implementation for every slice.
9. **Split tests** into Contract Tests (spec) and Logic Tests (handler). Never monolithic.
