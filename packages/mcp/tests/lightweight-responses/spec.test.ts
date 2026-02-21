import { JulesClientImpl, MemoryStorage, MemorySessionStorage } from '@google/jules-sdk';
import type {
  Activity,
  JulesClient,
  ActivitySummary,
  Artifact,
  JulesQuery,
  JulesDomain,
  ActivityAgentMessaged,
} from '@google/jules-sdk';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { toLightweight, toSummary } from '../../src/lightweight.js';
import { tools } from '../../src/tools.js';
import * as tokenizer from '../../src/tokenizer.js';
import { mockPlatform } from '../mocks/platform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPEC_FILE = path.resolve(
  __dirname,
  '../../spec/lightweight-responses/cases.yaml',
);

// #region Test Case Interfaces
interface BaseTestCase {
  id: string;
  description: string;
  category: string;
  status: 'pending' | 'implemented';
  priority: string;
}

interface ToSummaryTestCase extends BaseTestCase {
  when: 'toSummary';
  given: { activity: Activity };
  then: {
    result?: Partial<ActivitySummary>;
    summaryMaxLength?: number;
    summaryEndsWith?: string;
  };
}

interface ToLightweightTestCase extends BaseTestCase {
  when: 'toLightweight';
  given: { activity: Activity };
  options?: { includeArtifacts?: boolean };
  then: {
    result?: {
      artifacts?: null | Artifact[];
      artifactCount?: number;
      artifactsIncluded?: boolean;
    };
  };
}

interface McpSelectTestCase extends BaseTestCase {
  when: 'mcp_jules_select';
  given: {
    query: JulesQuery<JulesDomain>;
    activities?: Activity[];
  };
  then: {
    result: {
      items: {
        each: {
          hasSummary?: boolean;
          hasMessage?: boolean;
          artifactsStripped?: boolean;
          hasFullMessage?: boolean;
          hasArtifacts?: boolean;
        };
      };
      _meta?: {
        tokenCount: {
          lessThanOrEqual: number;
        };
      };
    };
  };
}

interface CompareFormatsTestCase extends BaseTestCase {
  when: 'compare_formats';
  given: {
    activities: {
      count: number;
      averageMessageLength: number;
      averageArtifactCount: number;
    };
  };
  then: {
    lightweightTokens: {
      lessThan: number;
    };
    fullTokens: {
      greaterThan: number;
    };
  };
}

type TestCase =
  | ToSummaryTestCase
  | ToLightweightTestCase
  | McpSelectTestCase
  | CompareFormatsTestCase;
// #endregion

function createTestActivity(
  overrides: Partial<ActivityAgentMessaged>,
): Activity {
  return {
    id: 'test-id',
    name: 'sessions/test/activities/test-id',
    type: 'agentMessaged',
    createTime: new Date().toISOString(),
    originator: 'agent',
    artifacts: [],
    message: 'test message',
    ...overrides,
  };
}

describe('Lightweight Responses Spec', async () => {
  const specContent = await fs.readFile(SPEC_FILE, 'utf-8');
  const testCases = (yaml.load(specContent) as TestCase[]).filter(
    (c) => c.status === 'implemented',
  );

  let mockJules: JulesClient;

  beforeAll(() => {
    mockJules = new JulesClientImpl(
      {
        apiKey: 'test-key',
        baseUrl: 'https://test.jules.com',
        config: { requestTimeoutMs: 1000 },
      },
      {
        activity: () => new MemoryStorage(),
        session: () => new MemorySessionStorage(),
      },
      mockPlatform,
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  for (const tc of testCases) {
    it(`${tc.id}: ${tc.description}`, async () => {
      switch (tc.when) {
        case 'toSummary': {
          const summaryResult = toSummary(tc.given.activity);
          if (tc.then.result) {
            expect(summaryResult).toEqual(
              expect.objectContaining(tc.then.result),
            );
          }
          if (tc.then.summaryMaxLength) {
            expect(summaryResult.summary.length).toBeLessThanOrEqual(
              tc.then.summaryMaxLength + 3,
            ); // +3 for "..."
          }
          if (tc.then.summaryEndsWith) {
            expect(
              summaryResult.summary.endsWith(tc.then.summaryEndsWith),
            ).toBe(true);
          }
          break;
        }

        case 'toLightweight': {
          const lightweightResult = toLightweight(
            tc.given.activity,
            tc.options,
          );
          if (tc.then.result) {
            if (tc.then.result.artifacts === null) {
              expect(lightweightResult.artifacts).toBeNull();
            }
            if (tc.then.result.artifactCount) {
              expect(lightweightResult.artifactCount).toBe(
                tc.then.result.artifactCount,
              );
            }
            if (tc.then.result.artifactsIncluded) {
              expect(lightweightResult.artifacts).not.toBeNull();
            }
            if (tc.then.result.artifacts) {
              expect(lightweightResult.artifacts?.[0]).toEqual(
                expect.objectContaining(tc.then.result.artifacts[0]),
              );
            }
          }
          break;
        }

        case 'mcp_jules_select': {
          vi.spyOn(mockJules, 'select').mockResolvedValue(
            tc.given.activities || [createTestActivity({ message: 'test' })],
          );
          const tool = tools.find((t) => t.name === 'query_cache');
          if (!tool) throw new Error('Tool not found: query_cache');
          const selectResult = await tool.handler(mockJules, {
            query: tc.given.query,
          });
          const selectContent = JSON.parse(selectResult.content[0].text);

          if (tc.id === 'LIGHT-12') {
            if (tc.then.result._meta) {
              expect(selectContent._meta.tokenCount).toBeLessThanOrEqual(
                tc.then.result._meta.tokenCount.lessThanOrEqual,
              );
            }
          } else {
            if (tc.then.result.items.each.hasSummary) {
              expect(selectContent.results[0]).toHaveProperty('summary');
            }
            if (tc.then.result.items.each.hasMessage) {
              // Lightweight activities now include the full message field
              expect(selectContent.results[0]).toHaveProperty('message');
            }
            if (tc.then.result.items.each.artifactsStripped) {
              expect(selectContent.results[0]).toHaveProperty(
                'artifacts',
                null,
              );
            }
            if (tc.then.result.items.each.hasFullMessage) {
              // When artifact fields are selected, we skip lightweight transformation
              // and return the full activity data with message and artifacts
              expect(selectContent.results[0]).toHaveProperty('message');
            }
            if (tc.then.result.items.each.hasArtifacts) {
              // Artifacts should be present (not null/stripped)
              expect(selectContent.results[0].artifacts).not.toBeNull();
            }
          }
          break;
        }

        case 'compare_formats': {
          const activities: Activity[] = [];
          for (let i = 0; i < tc.given.activities.count; i++) {
            activities.push(
              createTestActivity({
                id: `act-${i}`,
                message: 'a'.repeat(tc.given.activities.averageMessageLength),
                artifacts: Array(tc.given.activities.averageArtifactCount).fill(
                  {
                    type: 'bashOutput',
                    command: 'ls',
                  },
                ),
              }),
            );
          }

          const lightweightActivities = activities.map((a) => toLightweight(a));
          const lightweightTokens = tokenizer.estimateTokens(
            JSON.stringify(lightweightActivities),
          );
          const fullTokens = tokenizer.estimateTokens(
            JSON.stringify(activities),
          );

          expect(lightweightTokens).toBeLessThan(
            tc.then.lightweightTokens.lessThan,
          );
          expect(fullTokens).toBeGreaterThan(tc.then.fullTokens.greaterThan);

          break;
        }
      }
    });
  }
});
