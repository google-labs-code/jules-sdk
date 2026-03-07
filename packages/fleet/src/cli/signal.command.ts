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
import { outputArgs, renderResult, resolveOutputFormat } from '../shared/cli/output.js';
import { inputArgs, resolveInput } from '../shared/cli/input.js';
import { resolveSourceRef } from '../signal/resolve-source.js';

const create = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a signal (insight or assessment)',
  },
  args: {
    ...inputArgs,
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
    source: {
      type: 'string',
      description: 'Provenance ref (provider:resource:id, e.g. jules:session:s-12345)',
    },
    owner: {
      type: 'string',
      description: 'Repository owner (auto-detected from git remote if omitted)',
    },
    repo: {
      type: 'string',
      description: 'Repository name (auto-detected from git remote if omitted)',
    },
    ...outputArgs,
    'dry-run': {
      type: 'boolean',
      description: 'Validate input and show what would be created (no API calls)',
      default: false,
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

    // Resolve source ref (flag > FLEET_SOURCE_REF > JULES_SESSION_ID)
    const source = resolveSourceRef({
      flag: args.source as string | undefined,
      fleetSourceRef: process.env.FLEET_SOURCE_REF,
      julesSessionId: process.env.JULES_SESSION_ID,
    });

    // Parse & validate input through spec
    const input = SignalCreateInputSchema.parse({
      owner,
      repo,
      kind: args.kind,
      title: args.title,
      body,
      tags,
      scope: args.scope || undefined,
      source,
    });

    // Dry run: validate input and preview
    const format = resolveOutputFormat(args);
    if (args['dry-run']) {
      const preview = {
        success: true as const,
        data: {
          dryRun: true,
          wouldCreate: {
            kind: input.kind,
            title: input.title,
            repo: `${owner}/${repo}`,
            tags,
            scope: input.scope,
            source: input.source,
          },
        },
      };
      const previewJson = renderResult(preview, format, args.fields as string | undefined);
      console.log(previewJson ?? `Dry run: would create ${input.kind} "${input.title}" in ${owner}/${repo}`);
      return;
    }

    // Execute via handler
    const octokit = createFleetOctokit();
    const handler = new SignalCreateHandler({ octokit });
    const result = await handler.execute(input);
    const json = renderResult(result, format, args.fields as string | undefined);
    if (json !== null) {
      console.log(json);
      if (!result.success) process.exit(1);
      return;
    }

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
