// src/index.ts
// Export main classes

// Export types
export * from './types/core';

// Export utils for advanced users
export {
  buildWhereCondition,
  type ConditionEvaluator,
  type ModelRecord
} from './utils/condition-builder';

// Export subscription components for direct use
export { SubscriptionClient } from './subscribe/client';

// Convenience factory functions
import postgres from 'postgres';
import { TriggerManager } from './trigger/manager';
import { Registry } from './trigger/registry';

/**
 * Create a new TriggerManager instance
 */
export function createTriggerManager<Client>(
  sql: postgres.Sql
): TriggerManager<Client> {
  return new TriggerManager<Client>(sql);
}

/**
 * Create a new Registry instance
 */
export function createRegistry<Client>(sql: postgres.Sql): Registry<Client> {
  return new Registry<Client>(sql);
}

// Legacy compatibility - keeping the old PgTypesafeTriggers name as alias
export { TriggerManager as PgTypesafeTriggers };
