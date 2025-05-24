// src/index.ts
import { ConnectionManager } from './core/connection-manager';
import { TriggerRegistry } from './core/registry';
import {
  createTriggerBuilder,
  createTriggerFromConfig,
  TriggerBuilder,
  WithModelState
} from './core/trigger-builder';
import {
  ModelName,
  Registry,
  TriggerConfig,
  TriggerHandle,
  TriggerManagerOptions
} from './types';

// Re-export types
export * from './types';

// Export condition builders
export { sql, type Condition } from './core/conditions';

// Export the builder types
export type {
  CompleteState,
  EmptyState,
  TriggerBuilder,
  WithEventsState,
  WithModelState,
  WithNameState,
  WithTimingState
} from './core/trigger-builder';

// Main class that provides both APIs
export class TriggerManager<Client> {
  private connectionManager: ConnectionManager;

  constructor(databaseUrl: string, options: TriggerManagerOptions = {}) {
    this.connectionManager = new ConnectionManager({
      url: databaseUrl,
      plugins: options.plugins,
      lazy: options.lazy,
      connectionPool: options.connectionPool
    });
  }

  /**
   * Create a trigger using object configuration
   */
  create<M extends ModelName<Client>>(
    config: TriggerConfig<Client, M>
  ): TriggerHandle<Client, M> {
    return createTriggerFromConfig(config, this.connectionManager);
  }

  /**
   * Start building a trigger using fluent API
   */
  for<M extends ModelName<Client>>(
    model: M
  ): TriggerBuilder<Client, WithModelState<M>> {
    const builder = createTriggerBuilder<Client>(this.connectionManager);
    return builder.for(model);
  }

  /**
   * Create a registry for managing multiple triggers
   */
  registry(): Registry<Client> {
    return new TriggerRegistry(this.connectionManager);
  }

  /**
   * Create a registry with initial definitions
   */
  createRegistry(): Registry<Client> {
    return new TriggerRegistry(this.connectionManager);
  }

  /**
   * Dispose all resources
   */
  async dispose(): Promise<void> {
    await this.connectionManager.dispose();
  }

  /**
   * Check if disposed
   */
  isDisposed(): boolean {
    return this.connectionManager.isDisposed();
  }

  /**
   * Execute a query in a transaction
   */
  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return await this.connectionManager.transaction(fn);
  }

  /**
   * Get migration helper
   */
  migrations() {
    // Import MigrationHelper if needed
    const { MigrationHelper } = require('./core/migration-helpers');
    return new MigrationHelper(this.connectionManager);
  }
}

// Factory function
export function createTriggers<Client>(
  databaseUrl: string,
  options?: TriggerManagerOptions
): TriggerManager<Client> {
  return new TriggerManager<Client>(databaseUrl, options);
}

// Export individual components for advanced usage
export { BaseTrigger } from './core/base-trigger';
export { ConnectionManager } from './core/connection-manager';
export { MigrationHelper } from './core/migration-helpers';
export { TriggerRegistry } from './core/registry';
export {
  buildWhereCondition,
  type ConditionEvaluator
} from './utils/condition-parser';
export { getColumnName, getModelFields, getTableName } from './utils/prisma';
