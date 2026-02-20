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

// tests/snapshot/spec.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { SessionClientImpl } from '../../src/session.js';
import { SessionSnapshotImpl } from '../../src/snapshot.js';
import {
  Activity,
  SessionResource,
  SessionSnapshot,
  SessionOutcome,
  SessionOutput,
  PullRequest,
} from '../../src/types.js';

const createMockOutcome = (
  sessionId: string,
  title: string,
  outputs: SessionOutput[] = [],
): SessionOutcome => {
  // Extract PR from outputs, matching the real mapSessionResourceToOutcome behavior
  const prOutput = outputs.find((o) => o.type === 'pullRequest');
  const pullRequest = prOutput
    ? (prOutput as { type: 'pullRequest'; pullRequest: PullRequest })
        .pullRequest
    : undefined;

  return {
    sessionId,
    title,
    state: 'completed',
    outputs,
    pullRequest,
    generatedFiles: () => ({
      all: () => [],
      get: () => undefined,
      filter: () => [],
    }),
    changeSet: () => undefined,
  };
};

// Load and parse the YAML test cases
const casesFile = fs.readFileSync('spec/snapshot/cases.yaml', 'utf8');
const testCases = yaml.parse(casesFile);

// Mock SessionClient dependencies
const mockApiClient = {} as any;
const mockConfig = {} as any;
const mockActivityStorage = {} as any;
const mockSessionStorage = {} as any;
const mockPlatform = {} as any;

describe('SessionSnapshot Implementation', () => {
  for (const testCase of testCases) {
    if (testCase.status === 'pending') {
      it.skip(`[${testCase.id}] ${testCase.description}`, () => {});
      continue;
    }

    if (testCase.status === 'skipped') {
      it.skip(`[${testCase.id}] ${testCase.description}`, () => {});
      continue;
    }

    it(`[${testCase.id}] ${testCase.description}`, async () => {
      // --- GIVEN ---
      // --- GIVEN ---
      const sessionData = testCase.given.session || {};
      const sessionResource: SessionResource = {
        name: `sessions/${sessionData.id}`,
        id: sessionData.id,
        state: sessionData.state,
        createTime: sessionData.createTime ?? new Date().toISOString(),
        updateTime: sessionData.updateTime ?? new Date().toISOString(),
        prompt: 'test prompt',
        title: sessionData.title || 'test title',
        url: 'http://test.url',
        sourceContext: {} as any,
        source: {
          name: 'sources/github/test/repo',
          id: 'github/test/repo',
          type: 'githubRepo',
          githubRepo: { owner: 'test', repo: 'repo', isPrivate: false },
        },
        outputs: sessionData.outputs ?? [],
        outcome: createMockOutcome(
          sessionData.id,
          sessionData.title || 'test title',
          sessionData.outputs ?? [],
        ),
      };

      const activities: Activity[] = (testCase.given.activities ?? []).map(
        (a: any) => {
          const baseActivity = {
            ...a,
            createTime: a.createTime ?? new Date().toISOString(),
            originator: 'agent',
            artifacts: [],
          };

          if (a.type === 'planGenerated' && !a.plan) {
            baseActivity.plan = { steps: [], id: '', createTime: '' };
          }
          if (
            (a.type === 'userMessaged' || a.type === 'agentMessaged') &&
            !a.message
          ) {
            baseActivity.message = '';
          }
          if (a.type === 'sessionFailed' && !a.reason) {
            baseActivity.reason = 'Unknown error';
          }
          return baseActivity as Activity;
        },
      );

      const mockSessionClient = new SessionClientImpl(
        sessionData.id || 'test-session',
        mockApiClient,
        mockConfig,
        mockActivityStorage,
        mockSessionStorage,
        mockPlatform,
      );

      vi.spyOn(mockSessionClient, 'info').mockResolvedValue(sessionResource);
      vi.spyOn(mockSessionClient, 'history').mockImplementation(
        async function* () {
          for (const activity of activities) {
            yield activity;
          }
        },
      );

      // --- WHEN ---
      let result: any;
      if (testCase.when === 'snapshot') {
        result = { snapshot: await mockSessionClient.snapshot() };
      } else if (testCase.when === 'snapshotTwice') {
        const s1 = await mockSessionClient.snapshot();
        const s2 = await mockSessionClient.snapshot();
        result = { snapshotsAreDistinct: s1 !== s2 };
      } else if (testCase.when === 'snapshotToJSON') {
        const snapshot = await mockSessionClient.snapshot();
        result = { json: snapshot.toJSON() };
      } else if (testCase.when === 'snapshotStringify') {
        const snapshot = await mockSessionClient.snapshot();
        try {
          JSON.stringify(snapshot);
          result = { isValidJSON: true };
        } catch {
          result = { isValidJSON: false };
        }
      } else if (testCase.when === 'snapshotToMarkdown') {
        const snapshot = await mockSessionClient.snapshot();
        result = { markdown: snapshot.toMarkdown() };
      }

      // --- THEN ---
      const { then } = testCase;
      if (then.snapshot) {
        const snapshot = result.snapshot as SessionSnapshot;
        if (then.snapshot.id) expect(snapshot.id).toBe(then.snapshot.id);
        if (then.snapshot.state)
          expect(snapshot.state).toBe(then.snapshot.state);
        if (then.snapshot.activitiesLength)
          expect(snapshot.activities).toHaveLength(
            then.snapshot.activitiesLength,
          );
        if (then.snapshot.durationMs)
          expect(snapshot.durationMs).toBe(then.snapshot.durationMs);
        if (then.snapshot.activityCounts)
          expect(snapshot.activityCounts).toEqual(then.snapshot.activityCounts);
        if (then.snapshot.activityCountsKeyCount)
          expect(Object.keys(snapshot.activityCounts)).toHaveLength(
            then.snapshot.activityCountsKeyCount,
          );
        if (then.snapshot.timelineLength)
          expect(snapshot.timeline).toHaveLength(then.snapshot.timelineLength);
        if (then.snapshot.timeline) {
          const entry = snapshot.timeline[0];
          const expected = then.snapshot.timeline[0];
          if (expected.time) expect(entry.time).toBe(expected.time);
          if (expected.type) expect(entry.type).toBe(expected.type);
          if (expected.summary) expect(entry.summary).toBe(expected.summary);
          if (expected.summaryMaxLength)
            expect(entry.summary.length).toBeLessThanOrEqual(
              expected.summaryMaxLength,
            );
        }
        if (then.snapshot.insights) {
          const { insights: actualInsights } = snapshot;
          const { insights: expectedInsights } = then.snapshot;

          if (expectedInsights.completionAttempts) {
            expect(actualInsights.completionAttempts).toBe(
              expectedInsights.completionAttempts,
            );
          }
          if (expectedInsights.planRegenerations) {
            expect(actualInsights.planRegenerations).toBe(
              expectedInsights.planRegenerations,
            );
          }
          if (expectedInsights.userInterventions) {
            expect(actualInsights.userInterventions).toBe(
              expectedInsights.userInterventions,
            );
          }
        }
        if (then.snapshot.pr === null) {
          expect(snapshot.pr).toBeUndefined();
        } else if (then.snapshot.pr) {
          expect(snapshot.pr).toMatchObject(then.snapshot.pr);
        }
      }

      if (then.snapshotsAreDistinct !== undefined) {
        expect(result.snapshotsAreDistinct).toBe(then.snapshotsAreDistinct);
      }

      if (then.json) {
        expect(result.json.id).toBe(then.json.id);
        expect(result.json.state).toBe(then.json.state);
        if (then.json.createdAt)
          expect(new Date(result.json.createdAt).toISOString()).toBe(
            new Date(then.json.createdAt).toISOString(),
          );
        if (then.json.updatedAt)
          expect(new Date(result.json.updatedAt).toISOString()).toBe(
            new Date(then.json.updatedAt).toISOString(),
          );
      }

      if (then.isValidJSON !== undefined) {
        expect(result.isValidJSON).toBe(then.isValidJSON);
      }

      if (then.markdownContains) {
        for (const str of then.markdownContains) {
          expect(result.markdown).toContain(str);
        }
      }
    });
  }
});
