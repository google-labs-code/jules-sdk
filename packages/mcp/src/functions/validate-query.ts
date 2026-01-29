import {
  validateQuery as coreValidateQuery,
  formatValidationResult,
} from '@google/jules-sdk';
import type { ValidationResult } from './types.js';

/**
 * Validate a JQL query before execution.
 *
 * @param query - The JQL query object to validate
 * @returns Validation result with errors, warnings, and formatted message
 */
export function validateQuery(query: unknown): ValidationResult {
  if (!query) {
    throw new Error('query is required');
  }

  const result = coreValidateQuery(query);

  return {
    valid: result.valid,
    errors: result.errors.map((e) => e.message),
    warnings: result.warnings.map((w) => w.message),
    message: formatValidationResult(result),
  };
}
