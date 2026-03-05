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

import type { Octokit } from 'octokit';
import type { AuditInput, AuditResult, AuditSpec } from './spec.js';
import { resolveEntryPoints } from './pipeline/resolve-entries.js';
import { collectFindings } from './pipeline/collect-findings.js';
import { applyFixMode } from './pipeline/apply-fix-mode.js';
import { buildResult, buildErrorResult } from './pipeline/build-result.js';

export interface AuditHandlerDeps {
  octokit: Octokit;
}

/**
 * AuditHandler — thin orchestrator that wires the audit pipeline.
 *
 * Each step lives in `audit/pipeline/` to minimize merge conflicts:
 *   1. resolve-entries   — determine entry points
 *   2. collect-findings  — build lineage + scan nodes
 *   3. apply-fix-mode    — off / dry-run / apply
 *   4. build-result      — assemble AuditResult
 */
export class AuditHandler implements AuditSpec {
  private readonly octokit: Octokit;

  constructor(deps: AuditHandlerDeps) {
    this.octokit = deps.octokit;
  }

  async execute(input: AuditInput): Promise<AuditResult> {
    try {
      const entries = await resolveEntryPoints(this.octokit, input);
      const collected = await collectFindings(this.octokit, input, entries);
      const fixedCount = await applyFixMode(this.octokit, input, collected.findings);
      return buildResult(input, collected.findings, collected.graphs, {
        nodesScanned: collected.nodesScanned,
        totalUnresolved: collected.totalUnresolved,
        fixedCount,
      });
    } catch (error) {
      return buildErrorResult(error);
    }
  }
}
