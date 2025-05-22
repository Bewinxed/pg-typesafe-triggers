// src/types/core-extended.ts
import {
  ModelName,
  ModelField,
  TriggerTiming,
  TriggerOperation,
  TriggerForEach,
  NotificationPayload
} from './core';

/**
 * Configuration for creating a trigger
 */
export interface TriggerConfiguration {
  /** The Prisma model name */
  modelName: string;

  /** The actual database table name */
  tableName: string;

  /** A unique name for the trigger */
  triggerName: string;

  /** When the trigger fires */
  timing: TriggerTiming;

  /** The database event(s) that activate the trigger */
  events: TriggerOperation[];

  /** Whether trigger runs per row or per statement */
  forEach?: TriggerForEach;

  /** For UPDATE events, columns that trigger the event */
  updateOfColumns?: string[];

  /** SQL condition for WHEN clause */
  whenCondition?: string;

  /** The PostgreSQL function to execute */
  functionName: string;

  /** Arguments to pass to the function */
  functionArgs?: string[];

  /** Optional notification channel name */
  channelName?: string;
}

/**
 * Status information for a trigger
 */
export interface TriggerStatus {
  name: string;
  table: string;
  active: boolean;
  created: Date;
}

/**
 * Handle for managing a created trigger
 */
export interface TriggerHandle {
  /** Drop the trigger from the database */
  drop(): Promise<void>;

  /** Get current trigger status */
  getStatus(): Promise<TriggerStatus>;

  /** Enable or disable the trigger */
  setEnabled(enabled: boolean): Promise<void>;
}

// Re-export everything from core
export * from './core';
