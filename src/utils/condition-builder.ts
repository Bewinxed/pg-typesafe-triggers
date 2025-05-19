// src/utils/condition-builder.ts
import { ModelName, ModelField } from '../types/core';

/**
 * Extract the record type from a Prisma model
 */
export type ModelRecord<
  Client,
  M extends ModelName<Client>
> = Client[M] extends {
  findFirst: (...args: any[]) => Promise<infer Result>;
}
  ? Result extends null | undefined
    ? Record<string, never>
    : NonNullable<Result>
  : Record<string, unknown>;

/**
 * Truly typesafe condition evaluator function
 */
export type ConditionEvaluator<
  Client,
  M extends ModelName<Client>
> = (records: {
  NEW: ModelRecord<Client, M>;
  OLD: ModelRecord<Client, M>;
}) => boolean;

/**
 * Converts simple field comparisons to SQL WHERE conditions
 *
 * @template Client - The Prisma client type
 * @template M - The model name
 * @param modelName - The model name for type inference
 * @param condition - A function that defines the condition using NEW and OLD records
 * @returns SQL string for the condition
 */
export function buildWhereCondition<Client, M extends ModelName<Client>>(
  condition: ConditionEvaluator<Client, M>
): string {
  // Get the function body as string
  const conditionStr = condition.toString();

  // Log the original condition for debugging
  console.log('Original condition:', conditionStr);

  // Extract the relevant part of the function (the comparison expression)
  const body = conditionStr
    .replace(/^.*=>/, '') // Remove everything before =>
    .replace(/^\s*{\s*return\s*|\s*}\s*$/g, '') // Remove { return ... } if present
    .trim();

  console.log('Extracted condition body:', body);

  // Process the condition in steps to avoid conflicts

  // Step 1: Extract and store string literals first to avoid conflicts
  const stringLiterals: string[] = [];
  let processedBody = body.replace(/"([^"]*)"/g, (match, content) => {
    // Store the string literal
    const placeholder = `__STRING_LITERAL_${stringLiterals.length}__`;
    stringLiterals.push(content);
    return placeholder;
  });

  // Step 2: Handle field access (NEW.field, OLD.field)
  processedBody = processedBody
    .replace(/NEW\.(\w+)/g, 'NEW."$1"')
    .replace(/OLD\.(\w+)/g, 'OLD."$1"');

  // Step 3: Handle common operators
  processedBody = processedBody
    .replace(/===|==/g, '=')
    .replace(/!==|!=/g, '<>')
    .replace(/&&/g, 'AND')
    .replace(/\|\|/g, 'OR');

  // Step 4: Handle Prisma-style method expressions
  processedBody = processedBody
    .replace(/\.equals\(([^)]+)\)/g, ' = $1')
    .replace(/\.gt\(([^)]+)\)/g, ' > $1')
    .replace(/\.gte\(([^)]+)\)/g, ' >= $1')
    .replace(/\.lt\(([^)]+)\)/g, ' < $1')
    .replace(/\.lte\(([^)]+)\)/g, ' <= $1')
    .replace(/\.not\(([^)]+)\)/g, ' <> $1')
    .replace(/\.contains\(([^)]+)\)/g, " LIKE '%' || $1 || '%'")
    .replace(/\.startsWith\(([^)]+)\)/g, " LIKE $1 || '%'")
    .replace(/\.endsWith\(([^)]+)\)/g, " LIKE '%' || $1");

  // Step 5: Restore string literals as SQL string literals
  processedBody = stringLiterals.reduce((body, literal, index) => {
    return body.replace(`__STRING_LITERAL_${index}__`, `'${literal}'`);
  }, processedBody);

  console.log('Final SQL condition:', processedBody);

  return processedBody;
}

/**
 * A more structured way to define conditions - for complex cases
 */
export class ConditionBuilder<Client, M extends ModelName<Client>> {
  private conditions: string[] = [];
  private operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';

  /**
   * Creates a new condition builder
   *
   * @param operation - The operation type (INSERT, UPDATE, DELETE) to determine valid record references
   */
  constructor(
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' = 'UPDATE'
  ) {
    this.operation = operation;
  }

  /**
   * Gets the appropriate record reference based on operation type
   * - For DELETE, only OLD is valid
   * - For INSERT, only NEW is valid
   * - For UPDATE, both are valid, defaults to NEW
   */
  private getRecordPrefix(forceOld = false): 'NEW' | 'OLD' {
    if (forceOld || this.operation === 'DELETE') {
      return 'OLD';
    }
    if (this.operation === 'INSERT' || this.operation === 'UPDATE') {
      return 'NEW';
    }
    // Default fallback
    return 'NEW';
  }

  /**
   * Creates field different condition
   *
   * @param field - The field to compare (with proper typechecking)
   * @returns The condition builder for chaining
   */
  public fieldChanged(
    field: ModelField<Client, M>
  ): ConditionBuilder<Client, M> {
    // For DELETE, this can't work since there's no NEW
    if (this.operation === 'DELETE') {
      throw new Error(
        'fieldChanged() cannot be used with DELETE triggers as there is no NEW record'
      );
    }
    // For INSERT, this can't work since there's no OLD
    if (this.operation === 'INSERT') {
      throw new Error(
        'fieldChanged() cannot be used with INSERT triggers as there is no OLD record'
      );
    }

    this.conditions.push(`NEW."${field}" IS DISTINCT FROM OLD."${field}"`);
    return this;
  }

  /**
   * Creates a condition comparing a field to a value
   *
   * @param field - The field to compare
   * @param operator - The comparison operator
   * @param value - The value to compare against
   * @param forceOld - Force using OLD record even for non-DELETE operations
   * @returns The condition builder for chaining
   */
  public where(
    field: string,
    operator: '=' | '<>' | '>' | '>=' | '<' | '<=' | 'LIKE',
    value: unknown,
    forceOld = false
  ): ConditionBuilder<Client, M> {
    // Handle different value types
    let sqlValue: string;
    if (typeof value === 'string') {
      sqlValue = `'${value.replace(/'/g, "''")}'`; // Escape single quotes
    } else if (value === null) {
      sqlValue = 'NULL';
    } else {
      sqlValue = String(value);
    }

    // Get the appropriate record reference
    const recordPrefix = this.getRecordPrefix(forceOld);

    this.conditions.push(`${recordPrefix}."${field}" ${operator} ${sqlValue}`);
    return this;
  }

  /**
   * Creates a condition comparing NEW to OLD
   *
   * @param field - The field to compare
   * @param operator - The comparison operator
   * @returns The condition builder for chaining
   */
  public compareFields(
    field: string,
    operator: '=' | '<>' | '>' | '>=' | '<' | '<='
  ): ConditionBuilder<Client, M> {
    // For INSERT or DELETE, this can't work
    if (this.operation === 'INSERT') {
      throw new Error(
        'compareFields() cannot be used with INSERT triggers as there is no OLD record'
      );
    }
    if (this.operation === 'DELETE') {
      throw new Error(
        'compareFields() cannot be used with DELETE triggers as there is no NEW record'
      );
    }

    this.conditions.push(`NEW."${field}" ${operator} OLD."${field}"`);
    return this;
  }

  /**
   * Combines all conditions with AND
   *
   * @returns SQL string for the condition
   */
  public build(): string {
    return this.conditions.join(' AND ');
  }

  /**
   * Combines all conditions with OR
   *
   * @returns SQL string for the condition
   */
  public buildOr(): string {
    return this.conditions.join(' OR ');
  }
}
