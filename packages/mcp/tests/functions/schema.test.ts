import { describe, it, expect } from 'vitest';
import { getSchema } from '../../src/functions/schema.js';

describe('getSchema', () => {
  it('returns JSON schema by default', () => {
    const result = getSchema('all', 'json');

    expect(result.format).toBe('json');
    expect(result.content).toBeDefined();
  });

  it('returns markdown when requested', () => {
    const result = getSchema('all', 'markdown');

    expect(result.format).toBe('markdown');
    expect(String(result.content)).toContain('##');
  });

  it('returns sessions schema', () => {
    const result = getSchema('sessions', 'json');

    expect(result.format).toBe('json');
    expect(result.content).toBeDefined();
  });

  it('returns activities schema', () => {
    const result = getSchema('activities', 'json');

    expect(result.format).toBe('json');
    expect(result.content).toBeDefined();
  });
});
