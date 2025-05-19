// src/types/core.ts
// We avoid importing from @prisma/client directly to allow custom Prisma client implementations

/**
 * Timing for when a trigger should fire
 */
export type TriggerTiming = 'BEFORE' | 'AFTER' | 'INSTEAD OF';

/**
 * Database operations that can trigger a function
 */
export type TriggerOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';

/**
 * Whether the trigger function runs once per row or once per statement
 */
export type TriggerForEach = 'ROW' | 'STATEMENT';

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
