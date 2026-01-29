import { toSummary } from '../../src/lightweight.js';
import { describe, it, expect } from 'vitest';
import type {
  ActivityAgentMessaged,
  ActivityProgressUpdated,
  ActivityUserMessaged,
  ActivitySessionFailed,
} from '@google/jules-sdk';

const STUB_ACTIVITY_SESSION_FAILED: ActivitySessionFailed = {
  id: '6',
  name: 'session-failed',
  type: 'sessionFailed',
  reason: 'Something went wrong',
  createTime: new Date().toISOString(),
  originator: 'agent',
  artifacts: [],
};

describe('MCP Polish Specs', () => {
  describe('toSummary Edge Cases', () => {
    it('POLISH-01: Handles empty agent message', () => {
      const activity: ActivityAgentMessaged = {
        id: '1',
        name: 'agent-messaged',
        type: 'agentMessaged',
        message: '',
        createTime: new Date().toISOString(),
        originator: 'agent',
        artifacts: [],
      };
      const summary = toSummary(activity);
      expect(summary.summary).toBe('agentMessaged');
    });

    it('POLISH-02: Handles empty user message', () => {
      const activity: ActivityUserMessaged = {
        id: '2',
        name: 'user-messaged',
        type: 'userMessaged',
        message: '',
        createTime: new Date().toISOString(),
        originator: 'user',
        artifacts: [],
      };
      const summary = toSummary(activity);
      expect(summary.summary).toBe('userMessaged');
    });

    it('POLISH-03: Handles progress update with description only', () => {
      const activity: ActivityProgressUpdated = {
        id: '3',
        name: 'progress-updated',
        type: 'progressUpdated',
        description: 'Just a description',
        createTime: new Date().toISOString(),
        title: '',
        originator: 'agent',
        artifacts: [],
      };
      const summary = toSummary(activity);
      expect(summary.summary).toBe('Just a description');
    });

    it('POLISH-04: Handles progress update with title only', () => {
      const activity: ActivityProgressUpdated = {
        id: '4',
        name: 'progress-updated',
        type: 'progressUpdated',
        title: 'Just a title',
        createTime: new Date().toISOString(),
        description: '',
        originator: 'agent',
        artifacts: [],
      };
      const summary = toSummary(activity);
      expect(summary.summary).toBe('Just a title');
    });

    it('POLISH-05: Handles progress update with no title or description', () => {
      const activity: ActivityProgressUpdated = {
        id: '5',
        name: 'progress-updated',
        type: 'progressUpdated',
        createTime: new Date().toISOString(),
        title: '',
        description: '',
        originator: 'agent',
        artifacts: [],
      };
      const summary = toSummary(activity);
      expect(summary.summary).toBe('progressUpdated');
    });

    it('POLISH-06: Handles sessionFailed without a reason', () => {
      const activity = { ...STUB_ACTIVITY_SESSION_FAILED, reason: '' };
      const summary = toSummary(activity);
      expect(summary.summary).toBe('Session failed');
    });
  });
});
