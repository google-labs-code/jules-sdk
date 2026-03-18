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

/**
 * Shared in-memory state for mock GitHub fixtures.
 * All domain-specific mock files import from here.
 */

export const state: any = {
  branches: {
    main: {
      commit: {
        sha: 'main-sha-v1',
        commit: { tree: { sha: 'tree-main-v1' } },
      },
    },
  },
  prs: {
    1: { head: { sha: 'pr1-head-sha', ref: 'branch1' } },
    2: { head: { sha: 'pr2-head-sha', ref: 'branch2' } },
    3: { head: { sha: 'pr3-head-sha', ref: 'branch3' } },
    10: { head: { sha: 'pr10-head-sha', ref: 'branch10' } },
    11: { head: { sha: 'pr11-head-sha', ref: 'branch11' } },
    20: { head: { sha: 'pr20-head-sha', ref: 'branch20' } },
    21: { head: { sha: 'pr21-head-sha', ref: 'branch21' } },
    30: { head: { sha: 'pr30-head-sha', ref: 'branch30' } },
    31: { head: { sha: 'pr31-head-sha', ref: 'branch31' } },
    40: { head: { sha: 'pr40-head-sha', ref: 'branch40' } },
    41: { head: { sha: 'pr41-head-sha', ref: 'branch41' } },
    42: { head: { sha: 'pr42-head-sha', ref: 'branch42' } },
    50: { head: { sha: 'pr50-head-sha', ref: 'branch50' } },
    51: { head: { sha: 'pr51-head-sha', ref: 'branch51' } },
  },
  compares: {
    'main-sha-v1...pr1-head-sha': {
      files: [{ filename: 'src/auth.ts', status: 'modified' }],
    },
    'main-sha-v1...pr2-head-sha': {
      files: [{ filename: 'src/payments.ts', status: 'modified' }],
    },
    'main-sha-v1...pr3-head-sha': {
      files: [{ filename: 'src/logging.ts', status: 'modified' }],
    },
    'main-sha-v1...pr10-head-sha': {
      files: [{ filename: 'src/config.ts', status: 'modified' }],
      merge_base_commit: { sha: 'base-sha' },
    },
    'main-sha-v1...pr11-head-sha': {
      files: [{ filename: 'src/config.ts', status: 'modified' }],
    },
    'main-sha-v1...pr20-head-sha': { files: [] },
    'main-sha-v1...pr21-head-sha': { files: [] },
    'main-sha-v1...pr40-head-sha': {
      files: [
        { filename: 'src/a.ts', status: 'modified' },
        { filename: 'src/c.ts', status: 'modified' },
      ],
    },
    'main-sha-v1...pr41-head-sha': {
      files: [
        { filename: 'src/a.ts', status: 'modified' },
        { filename: 'src/b.ts', status: 'modified' },
      ],
    },
    'main-sha-v1...pr42-head-sha': {
      files: [
        { filename: 'src/b.ts', status: 'modified' },
        { filename: 'src/c.ts', status: 'modified' },
      ],
    },
    // PR 50: deletes src/deprecated.ts; PR 51: adds src/newfeature.ts — no overlap, clean batch
    'main-sha-v1...pr50-head-sha': {
      files: [{ filename: 'src/deprecated.ts', status: 'removed' }],
    },
    'main-sha-v1...pr51-head-sha': {
      files: [{ filename: 'src/newfeature.ts', status: 'added' }],
    },
  },
  contents: {
    'src/config.ts|base-sha': 'export const DEFAULT_TIMEOUT = 5000;',
    'src/config.ts|pr10-head-sha': 'export const DEFAULT_TIMEOUT = 10000;',
    'src/config.ts|pr11-head-sha': 'export const DEFAULT_TIMEOUT = 3000;',
  },
  repo: {
    allow_squash_merge: true,
    allow_merge_commit: true,
  },
  refs: {} as Record<string, string>,
};
