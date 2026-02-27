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

import { defineCommand } from 'citty';
import { readFileSync } from 'fs';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { getGitRepoInfo } from '../shared/auth/git.js';
import { SignalCreateInputSchema } from '../signal/spec.js';
import { SignalCreateHandler } from '../signal/handler.js';

const create = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a signal (insight or assessment)',
  },
  args: {
    title: {
      type: 'string',
      description: 'Signal title',
      required: true,
    },
    kind: {
      type: 'string',
      description: 'Signal kind: insight (informational) or assessment (actionable)',
      default: 'assessment',
    },
    body: {
      type: 'string',
      description: 'Signal body content (markdown)',
    },
    'body-file': {
      type: 'string',
      description: 'Path to a markdown file containing the signal body',
    },
    tag: {
      type: 'string',
      description: 'Tag/label to apply (comma-separated for multiple)',
    },
    scope: {
      type: 'string',
      description: 'Scope name (maps to milestone in GitHub)',
    },
    owner: {
      type: 'string',
      description: 'Repository owner (auto-detected from git remote if omitted)',
    },
    repo: {
      type: 'string',
      description: 'Repository name (auto-detected from git remote if omitted)',
    },
  },
  async run({ args }) {
    // Resolve body from flag or file
    let body = args.body ?? '';
    if (args['body-file']) {
      body = readFileSync(args['body-file'], 'utf-8');
    }

    // Auto-detect owner/repo
    let owner = args.owner;
    let repo = args.repo;
    if (!owner || !repo) {
      const repoInfo = await getGitRepoInfo();
      owner = owner || repoInfo.owner;
      repo = repo || repoInfo.repo;
    }

    // Parse tags
    const tags = args.tag ? (args.tag as string).split(',').map((t) => t.trim()) : [];

    // Parse & validate input through spec
    const input = SignalCreateInputSchema.parse({
      owner,
      repo,
      kind: args.kind,
      title: args.title,
      body,
      tags,
      scope: args.scope || undefined,
    });

    // Execute via handler
    const octokit = createFleetOctokit();
    const handler = new SignalCreateHandler({ octokit });
    const result = await handler.execute(input);

    if (!result.success) {
      console.error(`Error [${result.error.code}]: ${result.error.message}`);
      if (result.error.suggestion) {
        console.error(`  Suggestion: ${result.error.suggestion}`);
      }
      process.exit(1);
    }

    console.log(`Created signal #${result.data.id}: ${result.data.url}`);
  },
});

export default defineCommand({
  meta: {
    name: 'signal',
    description: 'Manage fleet signals (insights and assessments)',
  },
  subCommands: {
    create,
  },
});
