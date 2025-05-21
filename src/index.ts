// src/index.ts
// Export main trigger manager class
export {
  PgTriggerManager,
  TriggerDefinition,
  type TriggerCondition
} from './trigger';

// Export types
export * from './types/core';

// Export notification registry components
export * from './notification/registry';

// Export subscription components
export { SubscriptionClient } from './subscribe/client';

// Export condition builder utils
export {
  buildWhereCondition,
  type ConditionEvaluator,
  type ModelRecord
} from './utils/condition-builder';
