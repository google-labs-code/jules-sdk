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

// tests/mappers.test.ts
import { describe, it, expect } from 'vitest';
import {
  mapRestActivityToSdkActivity,
  mapRestArtifactToSdkArtifact,
} from '../src/mappers.js';
import { Activity, Artifact } from '../src/types.js';

import { mockPlatform } from './mocks/platform.js';

describe('mapRestArtifactToSdkArtifact', () => {
  it('should map a changeSet artifact correctly', () => {
    const restArtifact = {
      changeSet: {
        source: 'sources/github/test/repo',
        gitPatch: {
          unidiffPatch: '--- a/file.ts\n+++ b/file.ts',
          baseCommitId: 'abc',
          suggestedCommitMessage: 'feat: add a file',
        },
      },
    };
    const sdkArtifact = mapRestArtifactToSdkArtifact(
      restArtifact,
      mockPlatform,
    );
    expect(sdkArtifact.type).toBe('changeSet');
    // After mapping, it's a rich ChangeSetArtifact class with flattened properties
    expect((sdkArtifact as any).source).toBe('sources/github/test/repo');
    expect((sdkArtifact as any).gitPatch.unidiffPatch).toBe(
      '--- a/file.ts\n+++ b/file.ts',
    );
    expect(typeof (sdkArtifact as any).parsed).toBe('function');
  });

  it('should map a bashOutput artifact correctly', () => {
    const restArtifact = {
      bashOutput: {
        command: 'ls -l',
        stdout: 'total 0',
        stderr: '',
        exitCode: 0,
      },
    };
    const sdkArtifact = mapRestArtifactToSdkArtifact(
      restArtifact,
      mockPlatform,
    );
    expect(sdkArtifact.type).toBe('bashOutput');
    // After mapping, it's a rich object, not a raw one.
    expect((sdkArtifact as any).command).toBe('ls -l');
    expect((sdkArtifact as any).stdout).toBe('total 0');
  });

  it('should throw for an unknown artifact type', () => {
    const restArtifact = { unknown: {} };
    expect(() =>
      mapRestArtifactToSdkArtifact(restArtifact as any, mockPlatform),
    ).toThrow('Unknown artifact type');
  });
});

describe('mapRestActivityToSdkActivity', () => {
  const BASE_REST_ACTIVITY = {
    name: 'sessions/123/activities/456',
    id: '456',
    createTime: '2024-01-01T00:00:00Z',
    originator: 'agent' as const,
    artifacts: [],
  };

  it('should map an agentMessaged activity correctly', () => {
    const restActivity = {
      ...BASE_REST_ACTIVITY,
      agentMessaged: { agentMessage: 'Hello there!' },
    };
    const sdkActivity = mapRestActivityToSdkActivity(
      restActivity,
      mockPlatform,
    );
    expect(sdkActivity.type).toBe('agentMessaged');
    expect((sdkActivity as any).message).toBe('Hello there!');
  });

  it('should map a progressUpdated activity correctly', () => {
    const restActivity = {
      ...BASE_REST_ACTIVITY,
      progressUpdated: {
        title: 'Thinking',
        description: 'Analyzing the request...',
      },
    };
    const sdkActivity = mapRestActivityToSdkActivity(
      restActivity,
      mockPlatform,
    );
    expect(sdkActivity.type).toBe('progressUpdated');
    expect((sdkActivity as any).title).toBe('Thinking');
  });

  it('should map a planGenerated activity correctly', () => {
    const plan = {
      id: 'plan-1',
      steps: [{ id: 'step-1', title: 'Do the thing' }],
    };
    const restActivity = {
      ...BASE_REST_ACTIVITY,
      planGenerated: { plan },
    };
    const sdkActivity = mapRestActivityToSdkActivity(
      restActivity,
      mockPlatform,
    );
    expect(sdkActivity.type).toBe('planGenerated');
    expect((sdkActivity as any).plan.id).toBe('plan-1');
  });

  it('should map a sessionCompleted activity correctly', () => {
    const restActivity = {
      ...BASE_REST_ACTIVITY,
      sessionCompleted: {},
    };
    const sdkActivity = mapRestActivityToSdkActivity(
      restActivity,
      mockPlatform,
    );
    expect(sdkActivity.type).toBe('sessionCompleted');
  });

  it('should map a sessionFailed activity correctly', () => {
    const restActivity = {
      ...BASE_REST_ACTIVITY,
      sessionFailed: { reason: 'Something went wrong.' },
    };
    const sdkActivity = mapRestActivityToSdkActivity(
      restActivity,
      mockPlatform,
    );
    expect(sdkActivity.type).toBe('sessionFailed');
    expect((sdkActivity as any).reason).toBe('Something went wrong.');
  });

  it('should correctly map nested artifacts', () => {
    const restActivity = {
      ...BASE_REST_ACTIVITY,
      progressUpdated: { title: 'Executing command' },
      artifacts: [{ bashOutput: { command: 'npm install' } }],
    };
    const sdkActivity = mapRestActivityToSdkActivity(
      restActivity,
      mockPlatform,
    );
    expect(sdkActivity.artifacts).toHaveLength(1);
    expect(sdkActivity.artifacts[0].type).toBe('bashOutput');
  });

  it('should throw for an unknown activity type', () => {
    const restActivity = { ...BASE_REST_ACTIVITY, unknown: {} };
    expect(() =>
      mapRestActivityToSdkActivity(restActivity, mockPlatform),
    ).toThrow('Unknown activity type');
  });
});
