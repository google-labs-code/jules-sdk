import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { select } from '../../src/functions/select.js';
import { createMockClient } from './helpers.js';
import type { JulesQuery, JulesDomain } from '@google/jules-sdk';

describe('MCP select function', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    vi.spyOn(mockClient, 'select').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs successfully when a valid query is provided', async () => {
    const validQuery: JulesQuery<JulesDomain> = {
      from: 'sessions',
      limit: 10,
    };

    const result = await select(mockClient, validQuery);
    expect(result.results).toEqual([]);
    expect(mockClient.select).toHaveBeenCalledWith(validQuery);
  });

  it('throws validation error if query domain (from) is missing', async () => {
    const invalidQuery = {} as any;

    await expect(select(mockClient, invalidQuery)).rejects.toThrow(
      /INVALID_QUERY: Missing required field: from/i,
    );
    expect(mockClient.select).not.toHaveBeenCalled();
  });

  it('throws validation error if query domain (from) is invalid', async () => {
    const invalidQuery = {
      from: 'invalid_domain',
    } as any;

    await expect(select(mockClient, invalidQuery)).rejects.toThrow(
      /INVALID_QUERY: Invalid domain: "invalid_domain"/i,
    );
    expect(mockClient.select).not.toHaveBeenCalled();
  });

  it('throws validation error if limit is negative', async () => {
    const invalidQuery: JulesQuery<JulesDomain> = {
      from: 'sessions',
      limit: -5,
    };

    await expect(select(mockClient, invalidQuery)).rejects.toThrow(
      /INVALID_QUERY:.*limit cannot be negative/i,
    );
    expect(mockClient.select).not.toHaveBeenCalled();
  });
});
