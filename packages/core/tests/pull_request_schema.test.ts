import { describe, it, expect } from 'vitest';
import { PullRequest } from '../src/types.js';

describe('Pull Request Schema', () => {
  it('should support baseRef and headRef fields when provided', () => {
    const pr: PullRequest = {
      url: 'http://github.com/owner/repo/pull/1',
      title: 'Fix bug',
      description: 'Fixes the bug',
      baseRef: 'main',
      headRef: 'feature-branch',
    };

    expect(pr.baseRef).toBe('main');
    expect(pr.headRef).toBe('feature-branch');
  });

  it('should handle missing baseRef and headRef gracefully', () => {
    const pr: PullRequest = {
      url: 'http://github.com/owner/repo/pull/1',
      title: 'Fix bug',
      description: 'Fixes the bug',
    };

    expect(pr.baseRef).toBeUndefined();
    expect(pr.headRef).toBeUndefined();
  });
});
