// src/utils/condition-parser.ts
import { ModelName } from '../types';

/**
 * Extract the record type from a Prisma model
 */
export type ModelRecord<
  Client,
  M extends ModelName<Client>
> = M extends keyof Client
  ? Client[M] extends {
      findFirst: (...args: any[]) => Promise<infer Result>;
    }
    ? Result extends null | undefined
      ? Record<string, never>
      : NonNullable<Result>
    : Record<string, unknown>
  : Record<string, unknown>;

/**
 * Type-safe condition evaluator function
 */
export type ConditionEvaluator<
  Client,
  M extends ModelName<Client>
> = (records: {
  NEW: ModelRecord<Client, M>;
  OLD: ModelRecord<Client, M>;
}) => boolean;

/**
 * Converts JavaScript function conditions to SQL WHERE conditions
 *
 * Examples:
 * - `NEW.status === 'active'` → `NEW."status" = 'active'`
 * - `OLD.price < NEW.price` → `OLD."price" < NEW."price"`
 * - `NEW.name.includes('test')` → `NEW."name" LIKE '%test%'`
 *
 * @param condition - A function that defines the condition using NEW and OLD records
 * @returns SQL string for the condition
 */
export function buildWhereCondition<Client, M extends ModelName<Client>>(
  condition: ConditionEvaluator<Client, M>
): string {
  // Get the function body as string
  const conditionStr = condition.toString();

  // Extract the relevant part of the function
  let body = conditionStr
    .replace(/^[^{]*{\s*/, '') // Remove everything up to opening brace
    .replace(/\s*}[^}]*$/, '') // Remove closing brace and after
    .replace(/^\s*return\s+/, '') // Remove return statement
    .replace(/;$/, '') // Remove trailing semicolon
    .trim();

  // If it's an arrow function without braces, extract after =>
  if (!body && conditionStr.includes('=>')) {
    body = conditionStr.replace(/^.*=>\s*/, '').trim();
  }

  // Process the condition in steps to avoid conflicts

  // Step 1: Extract and store string literals first
  const stringLiterals: string[] = [];
  let processedBody = body.replace(
    /"([^"]*)"|'([^']*)'|`([^`]*)`/g,
    (match, double, single, template) => {
      const content = double || single || template;
      const placeholder = `__STRING_LITERAL_${stringLiterals.length}__`;
      stringLiterals.push(content);
      return placeholder;
    }
  );

  // Step 2: Handle null/undefined checks
  processedBody = processedBody
    .replace(/===\s*null/g, ' IS NULL')
    .replace(/!==\s*null/g, ' IS NOT NULL')
    .replace(/==\s*null/g, ' IS NULL')
    .replace(/!=\s*null/g, ' IS NOT NULL')
    .replace(/===\s*undefined/g, ' IS NULL')
    .replace(/!==\s*undefined/g, ' IS NOT NULL');

  // Step 3: Handle field access (NEW.field, OLD.field)
  processedBody = processedBody
    .replace(/NEW\.(\w+)/g, 'NEW."$1"')
    .replace(/OLD\.(\w+)/g, 'OLD."$1"');

  // Step 4: Handle common operators
  processedBody = processedBody
    .replace(/===|==/g, '=')
    .replace(/!==|!=/g, '<>')
    .replace(/&&/g, ' AND ')
    .replace(/\|\|/g, ' OR ')
    .replace(/!/g, 'NOT ');

  // Step 5: Handle common method patterns
  processedBody = processedBody
    // String methods
    .replace(/\.includes\(([^)]+)\)/g, " LIKE '%' || $1 || '%'")
    .replace(/\.startsWith\(([^)]+)\)/g, " LIKE $1 || '%'")
    .replace(/\.endsWith\(([^)]+)\)/g, " LIKE '%' || $1")
    .replace(/\.toLowerCase\(\)\s*=\s*([^)]+)/g, ' ILIKE $1') // Case-insensitive
    .replace(/\.toUpperCase\(\)\s*=\s*([^)]+)/g, ' ILIKE $1')

    // Array methods (for PostgreSQL arrays)
    .replace(/\.includes\(([^)]+)\)/g, ' @> ARRAY[$1]')

    // Remove method calls that don't translate
    .replace(/\.toLowerCase\(\)/g, '')
    .replace(/\.toUpperCase\(\)/g, '')
    .replace(/\.trim\(\)/g, '');

  // Step 6: Handle parentheses and boolean logic
  processedBody = processedBody
    .replace(/\(\s*([^)]+)\s*\)/g, '($1)') // Clean up parentheses spacing
    .replace(/NOT\s+NOT/g, ''); // Double negation

  // Step 7: Restore string literals as SQL string literals
  processedBody = stringLiterals.reduce((body, literal, index) => {
    return body.replace(
      `__STRING_LITERAL_${index}__`,
      `'${literal.replace(/'/g, "''")}'`
    );
  }, processedBody);

  // Step 8: Clean up extra spaces
  processedBody = processedBody.replace(/\s+/g, ' ').trim();

  return processedBody;
}

/**
 * Helper function to create type-safe conditions with better IDE support
 */
export function createCondition<Client, M extends ModelName<Client>>() {
  return (evaluator: ConditionEvaluator<Client, M>): string =>
    buildWhereCondition(evaluator);
}

/**
 * Examples of supported JavaScript to SQL conversions:
 *
 * Basic comparisons:
 * - `NEW.status === 'active'` → `NEW."status" = 'active'`
 * - `OLD.amount > 100` → `OLD."amount" > 100`
 * - `NEW.date >= OLD.date` → `NEW."date" >= OLD."date"`
 *
 * Null checks:
 * - `NEW.listId === null` → `NEW."listId" IS NULL`
 * - `OLD.deletedAt !== null` → `OLD."deletedAt" IS NOT NULL`
 *
 * Boolean logic:
 * - `NEW.active && OLD.active` → `NEW."active" AND OLD."active"`
 * - `NEW.status === 'A' || NEW.status === 'B'` → `NEW."status" = 'A' OR NEW."status" = 'B'`
 *
 * String operations:
 * - `NEW.name.includes('test')` → `NEW."name" LIKE '%test%'`
 * - `NEW.email.startsWith('admin')` → `NEW."email" LIKE 'admin%'`
 * - `NEW.code.endsWith('_v2')` → `NEW."code" LIKE '%_v2'`
 *
 * Complex conditions:
 * - `(NEW.status === 'active' && OLD.status !== 'active') || NEW.priority > 5`
 *   → `(NEW."status" = 'active' AND OLD."status" <> 'active') OR NEW."priority" > 5`
 */
