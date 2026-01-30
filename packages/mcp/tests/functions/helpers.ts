/**
 * Shared test utilities for function tests.
 */
import { vi } from 'vitest';
import {
  JulesClientImpl,
  MemoryStorage,
  MemorySessionStorage,
  ChangeSetArtifact,
  BashArtifact,
} from '@google/jules-sdk';
import type {
  JulesClient,
  SessionClient,
  SessionResource,
} from '@google/jules-sdk';
import { createMockPlatform } from '../mocks/platform.js';

/**
 * Creates a mock Jules client for testing.
 */
export function createMockClient(): JulesClient {
  return new JulesClientImpl(
    {
      apiKey: 'test-key',
      baseUrl: 'https://test.jules.com',
      config: { requestTimeoutMs: 1000 },
    },
    {
      activity: () => new MemoryStorage(),
      session: () => new MemorySessionStorage(),
    },
    createMockPlatform(),
  );
}

/**
 * Creates a mock snapshot with the given properties.
 */
export function createMockSnapshot(props: {
  id: string;
  state: string;
  title: string;
  url: string;
  pr?: { url: string; title: string };
  createdAt?: Date;
  updatedAt?: Date;
  durationMs?: number;
  insights?: {
    completionAttempts: number;
    planRegenerations: number;
    userInterventions: number;
    failedCommands: unknown[];
  };
  activityCounts?: Record<string, number>;
  changeSet?: {
    source: string;
    unidiffPatch: string;
  };
}) {
  return {
    id: props.id,
    state: props.state,
    title: props.title,
    url: props.url,
    pr: props.pr,
    createdAt: props.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: props.updatedAt ?? new Date('2024-01-01T00:01:00Z'),
    durationMs: props.durationMs ?? 60000,
    insights: props.insights ?? {
      completionAttempts: 1,
      planRegenerations: 0,
      userInterventions: 0,
      failedCommands: [],
    },
    activityCounts: props.activityCounts ?? {},
    changeSet: () => {
      if (props.changeSet) {
        return new ChangeSetArtifact(props.changeSet.source, {
          unidiffPatch: props.changeSet.unidiffPatch,
          baseCommitId: 'test-commit',
          suggestedCommitMessage: 'Test commit',
        });
      }
      return undefined;
    },
    toMarkdown: () => '# Session Report',
  };
}

/**
 * Creates a test activity with properly structured artifacts.
 */
export function createTestActivity(input: {
  id: string;
  type: string;
  createTime?: string;
  message?: string;
  artifacts: Array<{
    type: string;
    source?: string;
    gitPatch?: { unidiffPatch: string };
    command?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  }>;
}) {
  const artifacts = input.artifacts.map((a) => {
    if (a.type === 'changeSet' && a.gitPatch) {
      return new ChangeSetArtifact(a.source ?? 'agent', {
        unidiffPatch: a.gitPatch.unidiffPatch,
        baseCommitId: 'test-commit',
        suggestedCommitMessage: 'Test commit',
      });
    }
    if (a.type === 'bashOutput') {
      return new BashArtifact({
        command: a.command ?? '',
        stdout: a.stdout ?? '',
        stderr: a.stderr ?? '',
        exitCode: a.exitCode ?? 0,
      });
    }
    return a;
  });

  return {
    id: input.id,
    type: input.type,
    createTime: input.createTime ?? new Date().toISOString(),
    message: input.message,
    artifacts,
  };
}

/**
 * Mocks a session client with a snapshot.
 */
export function mockSessionWithSnapshot(
  client: JulesClient,
  snapshot: ReturnType<typeof createMockSnapshot>,
  activities: ReturnType<typeof createTestActivity>[] = [],
): void {
  const mockSessionClient: Pick<SessionClient, 'snapshot' | 'activities'> = {
    snapshot: vi.fn().mockResolvedValue({
      ...snapshot,
      activities,
    }),
    activities: {
      hydrate: vi.fn().mockResolvedValue(activities.length),
    } as any,
  };
  vi.spyOn(client, 'session').mockReturnValue(
    mockSessionClient as SessionClient,
  );
}

/**
 * Mocks a session client with activities.
 */
export function mockSessionWithActivities(
  client: JulesClient,
  activities: ReturnType<typeof createTestActivity>[],
): void {
  const mockSessionClient: Pick<SessionClient, 'activities'> = {
    activities: {
      hydrate: vi.fn().mockResolvedValue(0),
      select: vi.fn().mockResolvedValue(activities),
    } as any,
  };
  vi.spyOn(client, 'session').mockReturnValue(
    mockSessionClient as SessionClient,
  );
}
