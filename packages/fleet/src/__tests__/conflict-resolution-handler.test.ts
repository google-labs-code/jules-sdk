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

import { describe, it, expect, vi } from 'vitest';
import { ConflictResolutionHandler } from '../merge/conflict-resolution/handler.js';
import { CONFLICT_NOTIFICATION_TAG } from '../merge/conflict-resolution/spec.js';
import type { SessionDispatcher } from '../shared/session-dispatcher.js';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockOctokit(overrides: {
  comments?: any[];
  getContentResult?: any;
} = {}) {
  const { comments = [], getContentResult } = overrides;

  const defaultContent = {
    data: {
      content: Buffer.from(
        'from .client import JulesClient\n__all__ = ["JulesClient"]\n',
      ).toString('base64'),
    },
  };

  return {
    rest: {
      repos: {
        getContent: vi
          .fn()
          .mockResolvedValue(getContentResult ?? defaultContent),
      },
      issues: {
        listComments: vi.fn().mockResolvedValue({ data: comments }),
        createComment: vi.fn().mockResolvedValue({ data: { id: 999 } }),
      },
    },
  } as any;
}

function createMockDispatcher(overrides: {
  sendMessage?: ReturnType<typeof vi.fn>;
} = {}): SessionDispatcher {
  return {
    dispatch: vi.fn().mockResolvedValue({ id: 'mock-session' }),
    sendMessage: overrides.sendMessage ?? vi.fn().mockResolvedValue(undefined),
  };
}

const baseInput = {
  owner: 'davideast',
  repo: 'jules-sdk-python',
  baseBranch: 'main',
  conflictingPR: {
    number: 114,
    branchName: 'fix-105-inspect-activity-15481661885092594092',
  },
  conflictingFiles: ['src/jules/__init__.py'],
  peerPRs: [] as Array<{ number: number; files: string[] }>,
  maxNotifications: 3,
};

// ── Tests ────────────────────────────────────────────────────────────

describe('ConflictResolutionHandler', () => {
  const noopEmit = () => { };

  it('returns SESSION_NOT_FOUND when branch has no session ID', async () => {
    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher();
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    const result = await handler.execute({
      ...baseInput,
      conflictingPR: { number: 114, branchName: 'feat/my-feature' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SESSION_NOT_FOUND');
      expect(result.error.fallbackToRedispatch).toBe(true);
    }
  });

  it('sends message and records comment on first notification', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const octokit = createMockOctokit({ comments: [] });
    const dispatcher = createMockDispatcher({ sendMessage });
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('notified');
      expect(result.data.sessionId).toBe('15481661885092594092');
      expect(result.data.notificationCount).toBe(1);
    }

    // Sent the conflict message
    expect(sendMessage).toHaveBeenCalledWith(
      '15481661885092594092',
      expect.stringContaining('Merge Conflict Detected'),
    );

    // Recorded a comment
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(CONFLICT_NOTIFICATION_TAG),
      }),
    );
  });

  it('returns MAX_NOTIFICATIONS_REACHED after threshold', async () => {
    const existingComments = Array.from({ length: 3 }, (_, i) => ({
      body: `${CONFLICT_NOTIFICATION_TAG}\n\nAttempt ${i + 1}/3`,
    }));
    const octokit = createMockOctokit({ comments: existingComments });
    const dispatcher = createMockDispatcher();
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MAX_NOTIFICATIONS_REACHED');
      expect(result.error.fallbackToRedispatch).toBe(true);
    }

    // Should NOT have sent a message
    expect(dispatcher.sendMessage).not.toHaveBeenCalled();
  });

  it('sends another notification when under threshold', async () => {
    const existingComments = [
      { body: `${CONFLICT_NOTIFICATION_TAG}\n\nAttempt 1/3` },
    ];
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const octokit = createMockOctokit({ comments: existingComments });
    const dispatcher = createMockDispatcher({ sendMessage });
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('notified');
      expect(result.data.notificationCount).toBe(2);
    }
    expect(sendMessage).toHaveBeenCalled();
  });

  it('returns SEND_MESSAGE_FAILED when sendMessage throws', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('API error'));
    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher({ sendMessage });
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    const result = await handler.execute(baseInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SEND_MESSAGE_FAILED');
      expect(result.error.fallbackToRedispatch).toBe(true);
    }

    // Should NOT record a comment since the message wasn't sent
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('includes conflicting file names in the prompt', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher({ sendMessage });
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    await handler.execute(baseInput);

    const prompt = sendMessage.mock.calls[0][1];
    expect(prompt).toContain('#114');
    expect(prompt).toContain('src/jules/__init__.py');
  });

  it('includes base branch content in the prompt', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher({ sendMessage });
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    await handler.execute(baseInput);

    const prompt = sendMessage.mock.calls[0][1];
    expect(prompt).toContain('JulesClient');
    expect(prompt).toContain('__all__');
  });

  it('includes peer PR context in the prompt', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher({ sendMessage });
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    await handler.execute({
      ...baseInput,
      peerPRs: [{ number: 115, files: ['src/jules/__init__.py', 'examples/chat.py'] }],
    });

    const prompt = sendMessage.mock.calls[0][1];
    expect(prompt).toContain('PR #115');
    expect(prompt).toContain('examples/chat.py');
  });

  it('emits notifying and notified events', async () => {
    const events: any[] = [];
    const emit = (e: any) => events.push(e);
    const octokit = createMockOctokit();
    const dispatcher = createMockDispatcher();
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit,
    });

    await handler.execute(baseInput);

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('merge:conflict:notifying');
    expect(eventTypes).toContain('merge:conflict:notified');
  });

  it('records correct attempt count in comment', async () => {
    const existingComments = [
      { body: `${CONFLICT_NOTIFICATION_TAG}\n\nAttempt 1/3` },
    ];
    const octokit = createMockOctokit({ comments: existingComments });
    const dispatcher = createMockDispatcher();
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    await handler.execute(baseInput);

    const commentBody = octokit.rest.issues.createComment.mock.calls[0][0].body;
    expect(commentBody).toContain('**Attempt:** 2/3');
  });

  it('never throws, always returns a Result', async () => {
    const octokit = {
      rest: {
        repos: { getContent: vi.fn().mockRejectedValue(new Error('fail')) },
        issues: {
          listComments: vi.fn().mockRejectedValue(new Error('fail')),
          createComment: vi.fn().mockRejectedValue(new Error('fail')),
        },
      },
    } as any;
    const dispatcher = createMockDispatcher({
      sendMessage: vi.fn().mockRejectedValue(new Error('fail')),
    });
    const handler = new ConflictResolutionHandler({
      octokit,
      dispatcher,
      emit: noopEmit,
    });

    const result = await handler.execute(baseInput);

    expect(result).toBeDefined();
    expect(result.success).toBe(false);
  });
});
