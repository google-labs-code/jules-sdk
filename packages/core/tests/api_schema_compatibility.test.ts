
import { describe, it, expect } from 'vitest';
import {
  SessionResource,
  SourceContext,
  SessionOutcome,
  SessionState,
  GeneratedFile,
  Source,
} from '../src/types.js';

describe('API Schema Compatibility', () => {
  it('should allow SessionResource to be defined without "source" and with "archived" (optional)', () => {
    // This is primarily a compile-time test, but we can also verify runtime structure.
    const validSession: SessionResource = {
      name: 'sessions/123',
      id: '123',
      prompt: 'fix bug',
      sourceContext: {
        source: 'sources/github/owner/repo',
        // Verify these new fields exist on the type (if strict compilation)
        workingBranch: 'feature-branch',
        environmentVariablesEnabled: true,
      },
      // 'source' is omitted here.
      title: 'My Session',
      createTime: '2023-01-01T00:00:00Z',
      updateTime: '2023-01-01T00:00:00Z',
      state: 'completed' as SessionState,
      url: 'http://jules.google.com/sessions/123',
      outputs: [],
      outcome: {} as SessionOutcome,
      // Verify this new field exists on the type
      archived: false,
    };

    expect(validSession.id).toBe('123');
    expect(validSession.source).toBeUndefined();
    expect(validSession.archived).toBe(false);
    expect(validSession.sourceContext.workingBranch).toBe('feature-branch');
  });

  it('should allow SourceContext and GitHubRepo to have new fields', () => {
    const validSource: Source = {
      type: 'githubRepo',
      name: 'sources/github/owner/repo',
      id: 'github/owner/repo',
      githubRepo: {
        owner: 'owner',
        repo: 'repo',
        isPrivate: false,
        // New fields:
        defaultBranch: 'main',
        branches: ['main', 'dev'],
      },
    };

    expect(validSource.githubRepo.defaultBranch).toBe('main');
    expect(validSource.githubRepo.branches).toHaveLength(2);
  });
});
