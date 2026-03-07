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

import { Octokit } from 'octokit';
import { InitInputSchema, type InitInput } from './spec.js';
import { createFleetOctokit } from '../shared/auth/octokit.js';
import { resolveInput } from '../shared/cli/input.js';
import { runInitWizard, validateHeadlessInputs } from './wizard/index.js';
import { parseFeatureFlags } from './wizard/parse-features.js';
import { detectSecretsFromEnv } from './ops/detect-secrets.js';
import { isInteractive } from '../shared/ui/index.js';
import type { InitArgs, InitWizardResult } from './wizard/types.js';
import type { FleetEmitter } from '../shared/events.js';

/**
 * Unified context resolved from any input source.
 */
export interface InitContext {
  input: InitInput;
  secrets: Record<string, string>;
  octokit: Octokit;
}

/**
 * Failure result when input resolution fails.
 */
export interface InitContextFailure {
  success: false;
  error: {
    code: string;
    message: string;
    recoverable: boolean;
    suggestion?: string;
  };
}

export type InitContextResult = InitContext | InitContextFailure;

function isFailure(result: unknown): result is InitContextFailure {
  return typeof result === 'object' && result !== null && 'success' in result && (result as any).success === false;
}

/**
 * Build an Octokit instance based on the auth mode.
 * When auth=token, uses GITHUB_TOKEN directly.
 * When auth=app, uses createFleetOctokit() (App credentials from env).
 */
function buildOctokit(auth: 'token' | 'app'): Octokit {
  if (auth === 'token') {
    return new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  return createFleetOctokit() as unknown as Octokit;
}

/**
 * Resolve init context from any input source.
 *
 * Three paths:
 * 1. `args.json` → parse JSON payload, auto-detect secrets from env
 * 2. `args['non-interactive']` → headless wizard, auto-detect secrets from env
 * 3. interactive → wizard prompts, merge wizard + env secrets
 */
export async function resolveInitContext(
  args: Record<string, any>,
  emit: FleetEmitter,
): Promise<InitContextResult> {
  // ── Path 1: JSON ──
  if (args.json) {
    const input = resolveInput<InitInput>(InitInputSchema, args.json as string);
    const secrets = detectSecretsFromEnv(input.secrets);
    const octokit = buildOctokit(input.auth);
    return { input, secrets, octokit };
  }

  // ── Path 2/3: Wizard (headless or interactive) ──
  const nonInteractive = args['non-interactive'] || !isInteractive();
  const wizardArgs = args as unknown as InitArgs;
  const wizardResult = nonInteractive
    ? await validateHeadlessInputs(wizardArgs, emit)
    : await runInitWizard(wizardArgs, emit);

  // Propagate failure
  if (isFailure(wizardResult)) {
    return wizardResult as InitContextFailure;
  }

  const result = wizardResult as InitWizardResult;
  const { owner, repo, baseBranch, overwrite } = result;
  const features = result.features ?? parseFeatureFlags(wizardArgs);
  const intervalMinutes = result.intervalMinutes ?? 360;

  const input = resolveInput<InitInput>(InitInputSchema, undefined, {
    repo: `${owner}/${repo}`,
    owner,
    repoName: repo,
    baseBranch,
    overwrite,
    features,
    intervalMinutes,
    auth: result.authMethod,
    createRepo: args['create-repo'] ?? result.createRepo ?? false,
    visibility: args.visibility ?? result.visibility ?? 'private',
    description: args.description ?? result.description,
  });

  // Merge: env-detected secrets as base, wizard-collected secrets override
  const envSecrets = detectSecretsFromEnv();
  const secrets = { ...envSecrets, ...result.secretsToUpload };

  const octokit = buildOctokit(input.auth);
  return { input, secrets, octokit };
}
