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

import { writeFileSync } from 'node:fs';
import type { AuditFinding } from '../../audit/findings.js';
import type { AuditSuccess } from '../../audit/spec.js';
import type { SerializedGraph } from '../../audit/graph/serialize.js';
import type { FixMode } from './parse-input.js';

// ── JSON OUTPUT ────────────────────────────────────────────────────

export interface JsonOutputOptions {
  graph: boolean;
  outputFile?: string;
}

/**
 * Render audit results as JSON (stdout or file).
 */
export function renderJson(
  data: AuditSuccess['data'],
  filteredFindings: AuditFinding[],
  filteredGraph: SerializedGraph | undefined,
  opts: JsonOutputOptions,
): void {
  const outputData = opts.graph && filteredGraph
    ? { graph: filteredGraph }
    : { ...data, findings: filteredFindings };
  const jsonOutput = JSON.stringify(outputData, null, 2);

  if (opts.outputFile) {
    writeFileSync(opts.outputFile, jsonOutput, 'utf-8');
    console.log(`✅ Output written to ${opts.outputFile}`);
  } else {
    console.log(jsonOutput);
  }
}

// ── HUMAN OUTPUT ───────────────────────────────────────────────────

/**
 * Render audit results as human-readable text.
 */
export function renderHuman(
  data: AuditSuccess['data'],
  filteredFindings: AuditFinding[],
  fixMode: FixMode,
): void {
  console.log(`\n📋 Audit Results`);
  console.log(`   Nodes scanned: ${data.nodesScanned}`);
  console.log(`   Findings: ${filteredFindings.length}${filteredFindings.length !== data.totalFindings ? ` (${data.totalFindings} total)` : ''}`);
  console.log(`   Fixed: ${data.fixedCount}`);
  console.log(`   Unresolved edges: ${data.unresolvedEdges}`);

  if (filteredFindings.length > 0) {
    console.log(`\n   Findings:`);
    for (const f of filteredFindings) {
      const icon = f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
      const fix = f.fixed
        ? ' ✅ (fixed)'
        : f.wouldFix
          ? ' 🔧 (would fix)'
          : f.fixability === 'deterministic'
            ? ' 🔧 (fixable with --fix)'
            : '';
      console.log(`   ${icon} [${f.type}] ${f.detail}${fix}`);
    }
  }

  // Hints
  if (fixMode === 'dry-run') {
    const wouldFixCount = filteredFindings.filter((f) => f.wouldFix).length;
    if (wouldFixCount > 0) {
      console.log(`\n   💡 ${wouldFixCount} finding(s) can be auto-fixed. Run with --fix --apply to execute.`);
    }
  } else if (fixMode === 'off') {
    const fixableCount = filteredFindings.filter((f) => f.fixability === 'deterministic' && !f.fixed).length;
    if (fixableCount > 0) {
      console.log(`\n   💡 ${fixableCount} finding(s) are fixable. Run with --fix to preview.`);
    }
  }
}
