
import { describe, it, expect } from 'vitest';
import { JulesApiError, JulesNetworkError, JulesAuthenticationError, JulesRateLimitError } from '../src/errors.js';

describe('Security: URL Sanitization in Errors', () => {
  const sensitiveUrl = 'https://api.example.com/v1/data?token=secret-token&apiKey=12345#internal-fragment';
  const expectedSanitizedUrl = 'https://api.example.com/v1/data';

  it('JulesNetworkError should sanitize URL in message and property', () => {
    const error = new JulesNetworkError(sensitiveUrl);
    expect(error.url).not.toContain('secret-token');
    expect(error.message).not.toContain('secret-token');
    // We expect it to be sanitized
    expect(error.url).toBe(expectedSanitizedUrl);
  });

  it('JulesApiError should sanitize URL in message and property', () => {
    const error = new JulesApiError(sensitiveUrl, 500, 'Internal Server Error');
    expect(error.url).not.toContain('secret-token');
    expect(error.message).not.toContain('secret-token');
    expect(error.url).toBe(expectedSanitizedUrl);
  });

  it('JulesAuthenticationError should sanitize URL in message and property', () => {
    const error = new JulesAuthenticationError(sensitiveUrl, 401, 'Unauthorized');
    expect(error.url).not.toContain('secret-token');
    expect(error.message).not.toContain('secret-token');
    expect(error.url).toBe(expectedSanitizedUrl);
  });

  it('JulesRateLimitError should sanitize URL in message and property', () => {
    const error = new JulesRateLimitError(sensitiveUrl, 429, 'Too Many Requests');
    expect(error.url).not.toContain('secret-token');
    expect(error.message).not.toContain('secret-token');
    expect(error.url).toBe(expectedSanitizedUrl);
  });
});
