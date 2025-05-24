// src/types/index.ts
import { EventEmitter } from 'events';
import { Condition, ConditionBuilder } from '../core/conditions';

// Core trigger types
export const TriggerTiming = {
  BEFORE: 'BEFORE',
  AFTER: 'AFTER',
  INSTEAD_OF: 'INSTEAD OF'
} as const;

export type TriggerTiming = (typeof TriggerTiming)[keyof typeof TriggerTiming];

export const TriggerOperation = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  TRUNCATE: 'TRUNCATE'
} as const;

export type TriggerOperation =
  (typeof TriggerOperation)[keyof typeof TriggerOperation];

export const TriggerForEach = {
  ROW: 'ROW',
  STATEMENT: 'STATEMENT'
} as const;

export type TriggerForEach =
  (typeof TriggerForEach)[keyof typeof TriggerForEach];

// Extract model names from Prisma client
export type ModelName<Client> = {
  [K in keyof Client]: K extends string
    ? Client[K] extends { findMany: Function }
      ? K
      : never
    : never;
}[keyof Client & string];

// Extract field names from a model
export type ModelField<
  Client,
  M extends ModelName<Client>
> = Client[M] extends { findFirst: (...args: any[]) => Promise<infer Result> }
  ? Result extends null | undefined
    ? never
    : Result extends Record<string, any>
    ? keyof Result
    : string
  : string;

// Extract the record type from a model
export type ModelRecord<Client, M extends string> = M extends keyof Client
  ? Client[M] extends { findFirst: (...args: any[]) => Promise<infer Result> }
    ? NonNullable<Result> // This is correct - Result is the inferred type
    : never
  : never;

// Trigger event payload
export interface TriggerEvent<
  Client,
  M extends string,
  E extends TriggerOperation
> {
  operation: E;
  timestamp: Date;
  data: ModelRecord<Client, M>;
  table: string;
  schema: string;
}

// Records available in WHEN conditions based on operation
export type WhenRecords<
  Client,
  M extends string,
  E extends TriggerOperation
> = E extends 'INSERT'
  ? { NEW: ModelRecord<Client, M> }
  : E extends 'UPDATE'
  ? { NEW: ModelRecord<Client, M>; OLD: ModelRecord<Client, M> }
  : E extends 'DELETE'
  ? { OLD: ModelRecord<Client, M> }
  : E extends 'TRUNCATE'
  ? {}
  : never;

// src/types/index.ts - Fix the BuilderState and TriggerConfig alignment
interface BuilderState<Client, M extends ModelName<Client> = any> {
  model?: M;
  name?: string;
  timing?: TriggerTiming;
  events?: TriggerOperation[];
  forEach?: TriggerForEach;
  watchColumns?: Array<ModelField<Client, M>>;
  when?: string | ((c: ConditionBuilder<Client, M>) => Condition); // Align with TriggerConfig
  functionName?: string;
  functionArgs?: string[];
  notify?: string;
}
// src/types/index.ts - Add field type extraction
// Extract the type of a specific field
export type FieldType<
  Client,
  M extends ModelName<Client>,
  F extends ModelField<Client, M>
> = M extends keyof Client
  ? Client[M] extends { findFirst: (...args: any[]) => Promise<infer Result> }
    ? Result extends null | undefined
      ? never
      : Result extends Record<string, any>
      ? F extends keyof Result
        ? Result[F]
        : never
      : never
    : never
  : never;

// Trigger configuration
// In src/types/index.ts - update TriggerConfig
export type TriggerConfig<
  Client,
  M extends ModelName<Client>,
  E extends TriggerOperation = TriggerOperation
> = {
  model: M;
  name?: string;
  timing: TriggerTiming;
  events: E[];
  forEach: TriggerForEach;
  functionName: string;
  watchColumns?: 'UPDATE' extends E ? Array<ModelField<Client, M>> : never;
  when?: string | ((c: ConditionBuilder<Client, M>) => Condition);
  notify?: string;

  functionArgs?: string[];
};

// Trigger handle interface
export interface TriggerHandle<Client, M extends ModelName<Client>> {
  readonly config: TriggerConfig<Client, M>;

  setup(): Promise<void>;
  drop(): Promise<void>;
  listen(): Promise<void>;
  stop(): Promise<void>;

  subscribe<E extends TriggerOperation>(
    handler: (event: TriggerEvent<Client, M, E>) => void | Promise<void>
  ): () => void;

  getStatus(): TriggerStatus;
  isSetup(): boolean;
  isListening(): boolean;

  attachToRegistry(registry: Registry<Client>): void;
}

// Registry interface
export interface Registry<Client> {
  add<M extends ModelName<Client>>(
    modelOrTrigger: M | TriggerHandle<Client, any>,
    config?: Omit<TriggerConfig<Client, M>, 'model'>
  ): this;

  setup(): Promise<void>;
  listen(): Promise<void>;
  stop(): Promise<void>;
  drop(): Promise<void>;

  on<M extends ModelName<Client>>(
    model: M,
    handler: (
      event: TriggerEvent<Client, M, TriggerOperation>
    ) => void | Promise<void>
  ): () => void;

  getStatus(): RegistryStatus;
}

// Status types
export interface TriggerStatus {
  name: string;
  table: string;
  active: boolean;
  created?: Date;
  isSetup: boolean;
  isListening: boolean;
  channel?: string;
}

export interface RegistryStatus {
  triggers: Map<string, TriggerStatus>;
  isSetup: boolean;
  isListening: boolean;
}

// Plugin interface
export interface TriggerPlugin {
  name: string;
  version: string;

  install?(manager: any): Promise<void>;
  uninstall?(manager: any): Promise<void>;

  beforeSetup?(
    config: TriggerConfig<any, any>
  ): TriggerConfig<any, any> | Promise<TriggerConfig<any, any>>;
  afterSetup?(trigger: TriggerHandle<any, any>): void | Promise<void>;

  beforeNotification?(
    event: TriggerEvent<any, any, any>
  ): TriggerEvent<any, any, any> | Promise<TriggerEvent<any, any, any>>;
  afterNotification?(
    event: TriggerEvent<any, any, any>,
    duration: number
  ): void | Promise<void>;

  onError?(error: Error, context?: string): void | Promise<void>;
}

// Manager options
export interface TriggerManagerOptions {
  plugins?: TriggerPlugin[];
  lazy?: boolean;
  connectionPool?: {
    listener?: number;
    transaction?: number;
  };
}
