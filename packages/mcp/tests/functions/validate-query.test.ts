import { describe, it, expect } from 'vitest';
import { validateQuery } from '../../src/functions/validate-query.js';

describe('validateQuery', () => {
  it('returns valid for correct query', () => {
    const result = validateQuery({
      from: 'sessions',
      limit: 10,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for invalid domain', () => {
    const result = validateQuery({
      from: 'invalid',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns valid for activities query', () => {
    const result = validateQuery({
      from: 'activities',
      limit: 5,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for missing from field', () => {
    const result = validateQuery({});

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
