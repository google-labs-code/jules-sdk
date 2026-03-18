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
 * GitHub operations layer — barrel re-export.
 *
 * Implementation is split by domain to reduce merge conflicts:
 *   - github-pulls.ts  → PR operations (get, list, create, merge)
 *   - github-git.ts    → low-level Git objects (tree, blob, commit, ref)
 *   - github-repos.ts  → repository queries (branch, contents, compare)
 */

export {
  getPullRequest,
  createPullRequest,
  listPullRequests,
  listOpenPullRequests,
  mergePullRequest,
} from './github-pulls.js';

export {
  getTree,
  createBlob,
  createTree,
  createCommit,
  createRef,
  updateRef,
  deleteBranch,
} from './github-git.js';

export {
  getBranch,
  compareCommits,
  getContents,
  getRepo,
} from './github-repos.js';
