/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Query Validator for Jules Query Language
 *
 * Validates queries before execution, providing actionable error messages
 * for LLMs to self-correct their queries.
 */

import {
  SESSION_SCHEMA,
  ACTIVITY_SCHEMA,
  FILTER_OP_SCHEMA,
  FieldMeta,
} from './schema.js';

// ============================================
// Types
// ============================================

export interface ValidationError {
  /** Error code for programmatic handling */
  code: ValidationErrorCode;
  /** JSON path to the error location (e.g., "where.artifacts.type") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Suggested fix or valid alternatives */
  suggestion?: string;
}

export interface ValidationWarning {
  /** Warning code */
  code: string;
  /** JSON path to the warning location */
  path: string;
  /** Human-readable warning message */
  message: string;
}

export interface ValidationResult {
  /** Whether the query is valid */
  valid: boolean;
  /** Validation errors (if any) */
  errors: ValidationError[];
  /** Validation warnings (non-blocking issues) */
  warnings: ValidationWarning[];
  /** Auto-corrected query (if corrections were possible) */
  correctedQuery?: Record<string, unknown>;
}

export type ValidationErrorCode =
  | 'INVALID_STRUCTURE'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_DOMAIN'
  | 'INVALID_FIELD_PATH'
  | 'INVALID_OPERATOR'
  | 'INVALID_OPERATOR_VALUE'
  | 'COMPUTED_FIELD_FILTER'
  | 'INVALID_ORDER'
  | 'INVALID_LIMIT'
  | 'INVALID_SELECT_EXPRESSION';

// ============================================
// Valid Operators
// ============================================

const VALID_OPERATORS = new Set(
  FILTER_OP_SCHEMA.operators.map((op) => op.name),
);

const VALID_DOMAINS = new Set(['sessions', 'activities']);

const VALID_ORDERS = new Set(['asc', 'desc']);

// ============================================
// Field Path Resolution
// ============================================

/**
 * Resolve a dot-notation path to field metadata
 */
function resolveFieldPath(
  path: string,
  domain: 'sessions' | 'activities',
): { field: FieldMeta | null; exists: boolean; computedField: boolean } {
  const schema = domain === 'sessions' ? SESSION_SCHEMA : ACTIVITY_SCHEMA;
  const parts = path.split('.');

  let currentFields: FieldMeta[] = schema.fields;
  let currentField: FieldMeta | null = null;

  for (const part of parts) {
    const found = currentFields.find((f) => f.name === part);
    if (!found) {
      return { field: null, exists: false, computedField: false };
    }
    currentField = found;
    currentFields = found.fields || [];
  }

  return {
    field: currentField,
    exists: true,
    computedField: currentField?.computed || false,
  };
}

/**
 * Get all valid field names for a domain (including nested paths)
 */
function getValidFieldPaths(
  domain: 'sessions' | 'activities',
  prefix = '',
): string[] {
  const schema = domain === 'sessions' ? SESSION_SCHEMA : ACTIVITY_SCHEMA;
  const paths: string[] = [];

  function collectPaths(fields: FieldMeta[], currentPrefix: string) {
    for (const field of fields) {
      const fullPath = currentPrefix
        ? `${currentPrefix}.${field.name}`
        : field.name;
      paths.push(fullPath);
      if (field.fields) {
        collectPaths(field.fields, fullPath);
      }
    }
  }

  collectPaths(schema.fields, prefix);
  return paths;
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate query structure
 */
function validateStructure(
  query: unknown,
  errors: ValidationError[],
): query is Record<string, unknown> {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    errors.push({
      code: 'INVALID_STRUCTURE',
      path: '',
      message: 'Query must be a non-null object',
      suggestion: 'Provide a query object like { from: "sessions" }',
    });
    return false;
  }
  return true;
}

/**
 * Validate the 'from' field (domain)
 */
function validateDomain(
  query: Record<string, unknown>,
  errors: ValidationError[],
): 'sessions' | 'activities' | null {
  if (!('from' in query)) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      path: 'from',
      message: 'Missing required field: from',
      suggestion: 'Add from: "sessions" or from: "activities"',
    });
    return null;
  }

  const from = query.from;
  if (typeof from !== 'string' || !VALID_DOMAINS.has(from)) {
    errors.push({
      code: 'INVALID_DOMAIN',
      path: 'from',
      message: `Invalid domain: "${from}"`,
      suggestion: 'Valid domains are: "sessions", "activities"',
    });
    return null;
  }

  return from as 'sessions' | 'activities';
}

/**
 * Validate the 'select' field
 */
function validateSelect(
  select: unknown,
  domain: 'sessions' | 'activities',
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (select === undefined) return;

  if (!Array.isArray(select)) {
    errors.push({
      code: 'INVALID_STRUCTURE',
      path: 'select',
      message: 'select must be an array of strings',
      suggestion: 'Use select: ["id", "title"] or omit for default projection',
    });
    return;
  }

  for (let i = 0; i < select.length; i++) {
    const expr = select[i];
    if (typeof expr !== 'string') {
      errors.push({
        code: 'INVALID_SELECT_EXPRESSION',
        path: `select[${i}]`,
        message: `Select expression must be a string, got ${typeof expr}`,
      });
      continue;
    }

    // Handle wildcard
    if (expr === '*') continue;

    // Handle exclusion prefix
    const isExclusion = expr.startsWith('-');
    const fieldPath = isExclusion ? expr.slice(1) : expr;

    // Validate field path exists
    const resolution = resolveFieldPath(fieldPath, domain);
    if (!resolution.exists) {
      const validPaths = getValidFieldPaths(domain);
      const similar = validPaths.filter(
        (p) =>
          p.includes(fieldPath.split('.')[0]) ||
          fieldPath.split('.')[0].includes(p.split('.')[0]),
      );
      warnings.push({
        code: 'UNKNOWN_FIELD',
        path: `select[${i}]`,
        message: `Unknown field path: "${fieldPath}"`,
      });
      if (similar.length > 0) {
        warnings[warnings.length - 1].message +=
          `. Did you mean: ${similar.slice(0, 3).join(', ')}?`;
      }
    }
  }
}

/**
 * Validate the 'where' clause
 */
function validateWhere(
  where: unknown,
  domain: 'sessions' | 'activities',
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (where === undefined) return;

  if (typeof where !== 'object' || where === null || Array.isArray(where)) {
    errors.push({
      code: 'INVALID_STRUCTURE',
      path: 'where',
      message: 'where must be an object',
      suggestion:
        'Use where: { field: "value" } or where: { field: { op: value } }',
    });
    return;
  }

  const whereObj = where as Record<string, unknown>;

  for (const [key, value] of Object.entries(whereObj)) {
    const fieldPath = `where.${key}`;

    // Special case for 'search' - it's a virtual field
    if (key === 'search') {
      if (typeof value !== 'string') {
        errors.push({
          code: 'INVALID_OPERATOR_VALUE',
          path: fieldPath,
          message: 'search must be a string',
        });
      }
      continue;
    }

    // Validate field exists
    const resolution = resolveFieldPath(key, domain);
    if (!resolution.exists) {
      const validPaths = getValidFieldPaths(domain).filter(
        (p) =>
          SESSION_SCHEMA.fields.find((f) => f.name === p)?.filterable ||
          ACTIVITY_SCHEMA.fields.find((f) => f.name === p)?.filterable,
      );
      warnings.push({
        code: 'UNKNOWN_FIELD',
        path: fieldPath,
        message: `Unknown field: "${key}"`,
      });
    } else if (resolution.computedField) {
      errors.push({
        code: 'COMPUTED_FIELD_FILTER',
        path: fieldPath,
        message: `Cannot filter on computed field: "${key}"`,
        suggestion:
          'Computed fields (artifactCount, summary, durationMs) can only be selected, not filtered',
      });
    } else if (resolution.field && !resolution.field.filterable) {
      warnings.push({
        code: 'NON_FILTERABLE_FIELD',
        path: fieldPath,
        message: `Field "${key}" may not be efficiently filterable`,
      });
    }

    // Validate filter value/operator
    validateFilterValue(value, fieldPath, errors);
  }
}

/**
 * Validate a filter value (direct value or operator object)
 */
function validateFilterValue(
  value: unknown,
  path: string,
  errors: ValidationError[],
): void {
  // Direct value (equality shorthand)
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return;
  }

  // Operator object
  if (typeof value === 'object' && !Array.isArray(value)) {
    const opObj = value as Record<string, unknown>;
    const keys = Object.keys(opObj);

    if (keys.length === 0) {
      errors.push({
        code: 'INVALID_OPERATOR',
        path,
        message: 'Empty filter object',
        suggestion: 'Use { eq: value } or a direct value',
      });
      return;
    }

    for (const op of keys) {
      if (!VALID_OPERATORS.has(op)) {
        errors.push({
          code: 'INVALID_OPERATOR',
          path: `${path}.${op}`,
          message: `Invalid operator: "${op}"`,
          suggestion: `Valid operators: ${Array.from(VALID_OPERATORS).join(', ')}`,
        });
        continue;
      }

      // Validate operator value types
      const opValue = opObj[op];
      switch (op) {
        case 'eq':
        case 'neq':
        case 'gt':
        case 'lt':
        case 'gte':
        case 'lte':
          if (
            opValue !== null &&
            typeof opValue !== 'string' &&
            typeof opValue !== 'number' &&
            typeof opValue !== 'boolean'
          ) {
            errors.push({
              code: 'INVALID_OPERATOR_VALUE',
              path: `${path}.${op}`,
              message: `${op} operator requires a primitive value (string, number, boolean, or null)`,
            });
          }
          break;
        case 'contains':
          if (typeof opValue !== 'string') {
            errors.push({
              code: 'INVALID_OPERATOR_VALUE',
              path: `${path}.${op}`,
              message: 'contains operator requires a string value',
            });
          }
          break;
        case 'in':
          if (!Array.isArray(opValue)) {
            errors.push({
              code: 'INVALID_OPERATOR_VALUE',
              path: `${path}.${op}`,
              message: 'in operator requires an array of values',
              suggestion: 'Use in: ["value1", "value2"]',
            });
          }
          break;
        case 'exists':
          if (typeof opValue !== 'boolean') {
            errors.push({
              code: 'INVALID_OPERATOR_VALUE',
              path: `${path}.${op}`,
              message: 'exists operator requires a boolean value',
              suggestion: 'Use exists: true or exists: false',
            });
          }
          break;
      }
    }
  } else {
    errors.push({
      code: 'INVALID_OPERATOR_VALUE',
      path,
      message: `Invalid filter value type: ${typeof value}`,
      suggestion:
        'Use a primitive value for equality or an operator object like { contains: "text" }',
    });
  }
}

/**
 * Validate the 'order' field
 */
function validateOrder(order: unknown, errors: ValidationError[]): void {
  if (order === undefined) return;

  if (typeof order !== 'string' || !VALID_ORDERS.has(order)) {
    errors.push({
      code: 'INVALID_ORDER',
      path: 'order',
      message: `Invalid order: "${order}"`,
      suggestion: 'Valid values are: "asc", "desc"',
    });
  }
}

/**
 * Validate the 'limit' field
 */
function validateLimit(
  limit: unknown,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  if (limit === undefined) return;

  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    errors.push({
      code: 'INVALID_LIMIT',
      path: 'limit',
      message: 'limit must be an integer',
    });
    return;
  }

  if (limit < 0) {
    errors.push({
      code: 'INVALID_LIMIT',
      path: 'limit',
      message: 'limit cannot be negative',
    });
  }

  if (limit > 1000) {
    warnings.push({
      code: 'LIMIT_TOO_HIGH',
      path: 'limit',
      message: `limit of ${limit} exceeds maximum of 1000, will be capped`,
    });
  }
}

/**
 * Validate startAfter cursor
 */
function validateCursor(
  cursor: unknown,
  field: string,
  errors: ValidationError[],
): void {
  if (cursor === undefined) return;

  if (typeof cursor !== 'string') {
    errors.push({
      code: 'INVALID_STRUCTURE',
      path: field,
      message: `${field} must be a string (ID)`,
    });
  }
}

// ============================================
// Main Validation Function
// ============================================

/**
 * Validate a Jules Query Language query
 *
 * @param query - The query object to validate
 * @returns Validation result with errors, warnings, and optional corrections
 *
 * @example
 * ```typescript
 * const result = validateQuery({
 *   from: 'activities',
 *   where: { type: 'agentMessaged' },
 *   select: ['id', 'message']
 * });
 *
 * if (!result.valid) {
 *   console.log('Errors:', result.errors);
 * }
 * ```
 */
export function validateQuery(query: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Step 1: Validate basic structure
  if (!validateStructure(query, errors)) {
    return { valid: false, errors, warnings };
  }

  const queryObj = query as Record<string, unknown>;

  // Step 2: Validate domain
  const domain = validateDomain(queryObj, errors);
  if (!domain) {
    return { valid: false, errors, warnings };
  }

  // Step 3: Validate select
  validateSelect(queryObj.select, domain, errors, warnings);

  // Step 4: Validate where
  validateWhere(queryObj.where, domain, errors, warnings);

  // Step 5: Validate order
  validateOrder(queryObj.order, errors);

  // Step 6: Validate limit
  validateLimit(queryObj.limit, errors, warnings);

  // Step 7: Validate cursors
  validateCursor(queryObj.startAfter, 'startAfter', errors);
  validateCursor(queryObj.startAt, 'startAt', errors);

  // Step 8: Check for unknown top-level fields
  const validTopLevelFields = new Set([
    'from',
    'select',
    'where',
    'order',
    'limit',
    'startAfter',
    'startAt',
    'include',
    'tokenBudget',
    'offset',
  ]);

  for (const key of Object.keys(queryObj)) {
    if (!validTopLevelFields.has(key)) {
      warnings.push({
        code: 'UNKNOWN_QUERY_FIELD',
        path: key,
        message: `Unknown query field: "${key}"`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation result as a human-readable string
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('Query is valid.');
  } else {
    lines.push('Query validation failed:');
  }

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    for (const error of result.errors) {
      lines.push(`  - [${error.code}] ${error.path}: ${error.message}`);
      if (error.suggestion) {
        lines.push(`    Suggestion: ${error.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const warning of result.warnings) {
      lines.push(`  - [${warning.code}] ${warning.path}: ${warning.message}`);
    }
  }

  return lines.join('\n');
}
