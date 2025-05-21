// src/types/core.ts
// We avoid importing from @prisma/client directly to allow custom Prisma client implementations

import type { PrismaClient } from '@prisma/client';

// src/types/core.ts

/**
 * Timing options for database triggers
 *
 * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html PostgreSQL CREATE TRIGGER}
 */
export const TriggerTiming = {
  /**
   * ⏪ BEFORE
   *
   * Executes before the database operation happens.
   *
   * Example: Validate data or set default values
   * ```
   * timing: TriggerTiming.BEFORE // Validates email before INSERT
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/trigger-definition.html#TRIGGER-DEFINITION-BEFORE-VS-AFTER PostgreSQL BEFORE Triggers}
   */
  BEFORE: 'BEFORE',

  /**
   * ⏩ AFTER
   *
   * Executes after the database operation completes.
   *
   * Example: Send notifications or update related data
   * ```
   * timing: TriggerTiming.AFTER // Send email after INSERT
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/trigger-definition.html#TRIGGER-DEFINITION-BEFORE-VS-AFTER PostgreSQL AFTER Triggers}
   */
  AFTER: 'AFTER',

  /**
   * 🔄 INSTEAD OF
   *
   * Replaces the operation on a view with custom logic.
   *
   * Example: Implement custom INSERT on a complex view
   * ```
   * timing: TriggerTiming.INSTEAD_OF // Custom INSERT logic for view
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html#SQL-CREATETRIGGER-INSTEAD PostgreSQL INSTEAD OF Triggers}
   */
  INSTEAD_OF: 'INSTEAD OF'
} as const;

export type TriggerTiming = (typeof TriggerTiming)[keyof typeof TriggerTiming];

/**
 * Database operations that can trigger a function
 *
 * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html#SQL-CREATETRIGGER-EVENTS PostgreSQL Trigger Events}
 */
export const TriggerOperation = {
  /**
   * ➕ INSERT
   *
   * Fires when new rows are added to the table.
   *
   * Example: Send welcome email when new user is created
   * ```
   * events: [TriggerOperation.INSERT] // Notify when new records are created
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html#SQL-CREATETRIGGER-INSERT PostgreSQL INSERT Triggers}
   */
  INSERT: 'INSERT',

  /**
   * 🔄 UPDATE
   *
   * Fires when existing rows are modified.
   *
   * Example: Track status changes or update timestamps
   * ```
   * events: [TriggerOperation.UPDATE] // Log when records are modified
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html#SQL-CREATETRIGGER-UPDATE PostgreSQL UPDATE Triggers}
   */
  UPDATE: 'UPDATE',

  /**
   * ❌ DELETE
   *
   * Fires when rows are removed from the table.
   *
   * Example: Clean up related data or create audit logs
   * ```
   * events: [TriggerOperation.DELETE] // Archive data before deletion
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html#SQL-CREATETRIGGER-DELETE PostgreSQL DELETE Triggers}
   */
  DELETE: 'DELETE',

  /**
   * 🧹 TRUNCATE
   *
   * Fires when the table is truncated (all rows removed at once).
   *
   * Example: Reset dependent counters or notify system administrators
   * ```
   * events: [TriggerOperation.TRUNCATE] // Log table truncation events
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html#SQL-CREATETRIGGER-TRUNCATE PostgreSQL TRUNCATE Triggers}
   */
  TRUNCATE: 'TRUNCATE'
} as const;

export type TriggerOperation =
  (typeof TriggerOperation)[keyof typeof TriggerOperation];

/**
 * Whether the trigger function runs once per row or once per statement
 *
 * @see {@link https://www.postgresql.org/docs/current/sql-createtrigger.html#SQL-CREATETRIGGER-FOREACH PostgreSQL FOR EACH}
 */
export const TriggerForEach = {
  /**
   * 🔢 ROW
   *
   * Executes the trigger function once for each row affected by the operation.
   *
   * Example: Process individual records with detailed logic
   * ```
   * forEach: TriggerForEach.ROW // Apply business logic to each affected row
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/trigger-definition.html#TRIGGER-ROW-VS-STATEMENT PostgreSQL ROW Triggers}
   */
  ROW: 'ROW',

  /**
   * 📑 STATEMENT
   *
   * Executes the trigger function once for the entire SQL statement.
   *
   * Example: Perform batch operations or send a single notification
   * ```
   * forEach: TriggerForEach.STATEMENT // Send one notification regardless of row count
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/trigger-definition.html#TRIGGER-ROW-VS-STATEMENT PostgreSQL STATEMENT Triggers}
   */
  STATEMENT: 'STATEMENT'
} as const;

export type TriggerForEach =
  (typeof TriggerForEach)[keyof typeof TriggerForEach];

/**
 * Comparison operators for conditions in PostgreSQL
 *
 * @see {@link https://www.postgresql.org/docs/current/functions-comparison.html PostgreSQL Comparison Operators}
 */
export const ComparisonOperator = {
  /**
   * ✓ EQUALS
   *
   * Checks if values are equal.
   *
   * Example: Match records with exact field value
   * ```
   * condition.where('status', ComparisonOperator.EQUALS, 'active')
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/functions-comparison.html#FUNCTIONS-COMPARISON-OP-TABLE PostgreSQL = Operator}
   */
  EQUALS: '=',

  /**
   * ≠ NOT_EQUALS
   *
   * Checks if values are not equal.
   *
   * Example: Find all non-default records
   * ```
   * condition.where('status', ComparisonOperator.NOT_EQUALS, 'pending')
   * ```
   */
  NOT_EQUALS: '<>',

  /**
   * > GREATER_THAN
   *
   * Checks if left value is greater than right value.
   *
   * Example: Find high-value orders
   * ```
   * condition.where('amount', ComparisonOperator.GREATER_THAN, 1000)
   * ```
   */
  GREATER_THAN: '>',

  /**
   * ≥ GREATER_THAN_EQUALS
   *
   * Checks if left value is greater than or equal to right value.
   *
   * Example: Find orders meeting minimum threshold
   * ```
   * condition.where('amount', ComparisonOperator.GREATER_THAN_EQUALS, 100)
   * ```
   */
  GREATER_THAN_EQUALS: '>=',

  /**
   * < LESS_THAN
   *
   * Checks if left value is less than right value.
   *
   * Example: Find low-stock items
   * ```
   * condition.where('quantity', ComparisonOperator.LESS_THAN, 10)
   * ```
   */
  LESS_THAN: '<',

  /**
   * ≤ LESS_THAN_EQUALS
   *
   * Checks if left value is less than or equal to right value.
   *
   * Example: Find items at or below threshold
   * ```
   * condition.where('quantity', ComparisonOperator.LESS_THAN_EQUALS, 5)
   * ```
   */
  LESS_THAN_EQUALS: '<=',

  /**
   * 🔍 LIKE
   *
   * Pattern matching with wildcards (% for any sequence, _ for single character).
   *
   * Example: Find names starting with specific prefix
   * ```
   * condition.where('name', ComparisonOperator.LIKE, 'John%')
   * ```
   */
  LIKE: 'LIKE',

  /**
   * 🚫 NOT_LIKE
   *
   * Negated pattern matching with wildcards.
   *
   * Example: Exclude names with specific pattern
   * ```
   * condition.where('name', ComparisonOperator.NOT_LIKE, '%test%')
   * ```
   */
  NOT_LIKE: 'NOT LIKE',

  /**
   * 📋 IN
   *
   * Checks if value is in a list of values.
   *
   * Example: Match records with specific status values
   * ```
   * condition.where('status', ComparisonOperator.IN, ['active', 'pending'])
   * ```
   */
  IN: 'IN',

  /**
   * ⛔ NOT_IN
   *
   * Checks if value is not in a list of values.
   *
   * Example: Exclude specific categories
   * ```
   * condition.where('category', ComparisonOperator.NOT_IN, ['test', 'demo'])
   * ```
   */
  NOT_IN: 'NOT IN'
} as const;

export type ComparisonOperator =
  (typeof ComparisonOperator)[keyof typeof ComparisonOperator];

/**
 * Logical operators for combining conditions in PostgreSQL
 *
 * @see {@link https://www.postgresql.org/docs/current/functions-logical.html PostgreSQL Logical Operators}
 */
export const LogicalOperator = {
  /**
   * 🔗 AND
   *
   * Combines conditions with logical AND (all conditions must be true).
   *
   * Example: Find active premium users
   * ```
   * // status = 'active' AND plan = 'premium'
   * condition.buildWithLogic(LogicalOperator.AND)
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/functions-logical.html#FUNCTIONS-LOGICAL-OPERATOR-TABLE PostgreSQL AND Operator}
   */
  AND: 'AND',

  /**
   * 🔀 OR
   *
   * Combines conditions with logical OR (at least one condition must be true).
   *
   * Example: Find users that are either premium or have been active recently
   * ```
   * // plan = 'premium' OR last_active > '2023-01-01'
   * condition.buildWithLogic(LogicalOperator.OR)
   * ```
   *
   * @see {@link https://www.postgresql.org/docs/current/functions-logical.html#FUNCTIONS-LOGICAL-OPERATOR-TABLE PostgreSQL OR Operator}
   */
  OR: 'OR'
} as const;

export type LogicalOperator =
  (typeof LogicalOperator)[keyof typeof LogicalOperator];

/**
 * Generic type for extracting table/model names from a Prisma client type
 * This approach properly works with Prisma's getter property structure
 */
export type ModelName<Client> = {
  [K in keyof Client]: K extends string
    ? Client[K] extends { findMany: Function }
      ? K
      : never
    : never;
}[keyof Client & string];

/**
 * Generic type for extracting field names from a model
 */
export type ModelField<
  Client,
  M extends ModelName<Client>
> = Client[M] extends {
  findFirst: (...args: any[]) => Promise<infer Result>;
}
  ? Result extends null | undefined
    ? never
    : Result extends Record<string, any>
    ? keyof Result
    : string
  : string;

/**
 * Options for defining a database trigger
 */
export interface DefineTriggerOptions<Client, M extends ModelName<Client>> {
  /** The Prisma model (table) on which the trigger operates */
  modelName: M;

  /** The actual database table name (retrieved from Prisma) */
  tableName?: string;

  /** A unique name for the trigger */
  triggerName: string;

  /** When the trigger fires */
  timing: TriggerTiming;

  /** The database event(s) that activate the trigger */
  events: TriggerOperation[];

  /** Defines if the trigger procedure is fired once for every affected row or once per SQL statement */
  forEach?: TriggerForEach;

  /** For UPDATE events, specifies columns that, when updated, will fire the trigger */
  updateOfColumns?: Array<ModelField<Client, M>>;

  /** A raw SQL string for the WHEN clause (e.g., OLD.status IS DISTINCT FROM NEW.status) */
  whenCondition?: string;

  /** The name of the PostgreSQL function to execute */
  functionName: string;

  /** Arguments to pass to the trigger function */
  functionArgs?: string[];
}

/**
 * Interface for notification payloads from triggers
 */
export interface NotificationPayload<T> {
  /** The operation that triggered the notification (INSERT, UPDATE, DELETE) */
  operation: TriggerOperation;

  /** Timestamp when the notification was sent */
  timestamp: string;

  /** The data associated with the notification (typically the NEW or OLD record) */
  data: T;
}

/**
 * Options for subscribing to trigger notifications
 *
 * @template T - The expected shape of the notification payload
 */
export interface SubscribeOptions<T> {
  /** Callback to be invoked when a notification is received */
  onNotification: (payload: T) => void | Promise<void>;

  /** Optional custom parser for the notification payload */
  parser?: (jsonString: string) => T;

  /** Optional validator for ensuring payload matches expected shape */
  validator?: (data: any) => T;

  /** Optional error handler */
  onError?: (error: Error, rawPayload?: string) => void;
}

/**
 * Type for the Prisma client
 */
export type PrismaClientType = PrismaClient;

/**
 * Type for Prisma DMMF structure we need to access
 */
export interface PrismaDMMF {
  modelMap: Record<string, PrismaModel>;
}

/**
 * Type for Prisma model in DMMF
 */
export interface PrismaModel {
  name: string;
  fields: Record<string, PrismaField>;
  mappings: {
    model: string;
  };
}

/**
 * Type for Prisma field in DMMF
 */
export interface PrismaField {
  name: string;
  type: string;
  kind: string;
  isRequired: boolean;
}

/**
 * Extended type for PrismaClient that includes internal DMMF property
 */
export interface PrismaClientWithDMMF extends PrismaClientType {
  _baseDmmf?: PrismaDMMF;
  _dmmf?: PrismaDMMF;
}
