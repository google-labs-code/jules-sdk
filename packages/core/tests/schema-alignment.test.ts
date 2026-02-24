
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mapRestSessionToSdkSession,
  mapRestArtifactToSdkArtifact
} from '../src/mappers.js';
import {
  MediaArtifact,
  BashArtifact
} from '../src/artifacts.js';
import {
  jules as defaultJules,
  JulesClient,
  SessionClient,
  SessionState
} from '../src/index.js';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer();

beforeEach(() => {
  server.listen();
  server.resetHandlers();
  vi.useFakeTimers();
});

afterEach(() => {
  server.close();
  vi.useRealTimers();
});

describe('API Protocol Alignment', () => {

  describe('Session State Mapping', () => {
    it('should map SCREAMING_SNAKE_CASE states to camelCase', () => {
      const apiStates: { input: string, expected: SessionState }[] = [
        { input: 'AWAITING_PLAN_APPROVAL', expected: 'awaitingPlanApproval' },
        { input: 'AWAITING_USER_FEEDBACK', expected: 'awaitingUserFeedback' },
        { input: 'IN_PROGRESS', expected: 'inProgress' },
        { input: 'QUEUED', expected: 'queued' },
        { input: 'PLANNING', expected: 'planning' },
        { input: 'COMPLETED', expected: 'completed' },
        { input: 'FAILED', expected: 'failed' },
        { input: 'PAUSED', expected: 'paused' },
        { input: 'UNSPECIFIED', expected: 'unspecified' },
      ];

      for (const { input, expected } of apiStates) {
        const result = mapRestSessionToSdkSession({
          id: 'test',
          state: input
        });
        expect(result.state).toBe(expected);
      }
    });

    it('should fallback to lowercase for unknown SCREAMING_SNAKE_CASE states', () => {
        const result = mapRestSessionToSdkSession({
          id: 'test',
          state: 'UNKNOWN_NEW_STATE'
        });
        // We expect it to try lowercasing it if it's not in the map
        expect(result.state).toBe('unknown_new_state');
    });

    it('should pass through already correct camelCase states', () => {
      const result = mapRestSessionToSdkSession({
        id: 'test',
        state: 'awaitingPlanApproval'
      });
      expect(result.state).toBe('awaitingPlanApproval');
    });
  });

  describe('Artifact Mapping', () => {
    const mockPlatform = {
      crypto: {},
      encoding: {},
      saveFile: vi.fn(),
      createDataUrl: vi.fn(),
    };

    it('should map MediaArtifact mimeType to format if format is missing', () => {
      const rawArtifact = {
        media: {
          data: 'base64data',
          mimeType: 'image/png' // API only provides mimeType
          // format is missing
        }
      };

      const artifact = mapRestArtifactToSdkArtifact(rawArtifact as any, mockPlatform);

      expect(artifact).toBeInstanceOf(MediaArtifact);
      expect((artifact as MediaArtifact).format).toBe('image/png');
    });

    it('should prefer explicit format if present on MediaArtifact', () => {
      const rawArtifact = {
        media: {
          data: 'base64data',
          mimeType: 'image/jpeg',
          format: 'image/png' // format takes precedence
        }
      };

      const artifact = mapRestArtifactToSdkArtifact(rawArtifact as any, mockPlatform);

      expect((artifact as MediaArtifact).format).toBe('image/png');
    });

    it('should map BashArtifact output to stdout if stdout is missing', () => {
      const rawArtifact = {
        bashOutput: {
          command: 'ls',
          output: 'file1.txt', // API uses output
          exitCode: 0
          // stdout is missing
        }
      };

      const artifact = mapRestArtifactToSdkArtifact(rawArtifact as any, mockPlatform);

      expect(artifact).toBeInstanceOf(BashArtifact);
      expect((artifact as BashArtifact).stdout).toBe('file1.txt');
      expect((artifact as BashArtifact).stderr).toBe(''); // Should default stderr to empty string
    });

    it('should prefer explicit stdout if present on BashArtifact', () => {
      const rawArtifact = {
        bashOutput: {
          command: 'ls',
          output: 'combined output',
          stdout: 'standard output',
          stderr: 'error output',
          exitCode: 0
        }
      };

      const artifact = mapRestArtifactToSdkArtifact(rawArtifact as any, mockPlatform);

      expect((artifact as BashArtifact).stdout).toBe('standard output');
      expect((artifact as BashArtifact).stderr).toBe('error output');
    });
  });

  describe('SessionClient Integration', () => {
    let jules: JulesClient;
    let session: SessionClient;
    const sessionId = `SESSION_ALIGNMENT_${Date.now()}`;

    beforeEach(() => {
      jules = defaultJules.with({
        apiKey: 'test-key',
        config: { pollingIntervalMs: 10 },
      });
      session = jules.session(sessionId);
    });

    it('waitFor() should correctly match SCREAMING_SNAKE_CASE API response', async () => {
      let callCount = 0;
      server.use(
        http.get(
          `https://jules.googleapis.com/v1alpha/sessions/${sessionId}`,
          () => {
            callCount++;
            // Simulate API returning SCREAMING_SNAKE_CASE
            // First call: IN_PROGRESS
            // Second call: AWAITING_PLAN_APPROVAL
            const state = callCount > 1 ? 'AWAITING_PLAN_APPROVAL' : 'IN_PROGRESS';
            return HttpResponse.json({ id: sessionId, state });
          },
        ),
      );

      const waitForPromise = session.waitFor('awaitingPlanApproval');

      // Advance timers to trigger polling
      await vi.advanceTimersByTimeAsync(50);

      await expect(waitForPromise).resolves.toBeUndefined();
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('info() should return normalized state', async () => {
      server.use(
        http.get(
          `https://jules.googleapis.com/v1alpha/sessions/${sessionId}`,
          () => {
            return HttpResponse.json({ id: sessionId, state: 'AWAITING_USER_FEEDBACK' });
          },
        ),
      );

      const info = await session.info();
      expect(info.state).toBe('awaitingUserFeedback');
    });
  });
});
