import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateToTokenBudget } from '../src/tokenizer.js';

describe('MCP Tokenizer', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens based on character count', () => {
      expect(estimateTokens('short')).toBe(2); // length 5 -> ceil(5/4) = 2
      expect(estimateTokens('a bit longer')).toBe(3); // length 12 -> ceil(12/4) = 3
      // {"a":1,"b":"test"} -> length 18 -> ceil(18/4) = 5
      expect(estimateTokens(JSON.stringify({ a: 1, b: 'test' }))).toBe(5);
    });
  });

  describe('truncateToTokenBudget', () => {
    const items = [
      { id: 1, data: 'short' }, // 23 chars -> 6 tokens
      { id: 2, data: 'medium length data' }, // 36 chars -> 9 tokens
      { id: 3, data: 'this is a much longer string of data' }, // 55 chars -> 14 tokens
      { id: 4, data: 'final item' }, // 28 chars -> 7 tokens
    ];
    // Total tokens = 6 + 9 + 14 + 7 = 36

    it('should not truncate if items fit within the budget', () => {
      const budget = 1000;
      const {
        items: truncatedItems,
        truncated,
        tokenCount,
      } = truncateToTokenBudget(items, budget);
      expect(truncated).toBe(false);
      expect(truncatedItems.length).toBe(items.length);
      expect(tokenCount).toBeLessThan(budget);
    });

    it('should truncate items to fit within the token budget', () => {
      const budget = 120; // available = 20. Allows first 2 items (6+9=15) but not third (15+14=29)
      const {
        items: truncatedItems,
        truncated,
        tokenCount,
      } = truncateToTokenBudget(items, budget);
      expect(truncated).toBe(true);
      expect(truncatedItems.length).toBe(2);
      expect(truncatedItems[0].id).toBe(1);
      expect(truncatedItems[1].id).toBe(2);
      expect(tokenCount).toBeLessThan(budget);
    });

    it('should handle an empty array', () => {
      const {
        items: truncatedItems,
        truncated,
        tokenCount,
      } = truncateToTokenBudget([], 100);
      expect(truncated).toBe(false);
      expect(truncatedItems.length).toBe(0);
      expect(tokenCount).toBe(0);
    });

    it('should respect the overhead', () => {
      const budget = 70;
      const overhead = 50; // Leaves 20 for items. Allows first 2.
      const { items: truncatedItems } = truncateToTokenBudget(
        items,
        budget,
        overhead,
      );
      expect(truncatedItems.length).toBe(2);
    });
  });
});
