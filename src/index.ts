// src/index.ts
import { ConnectionManager } from './core/connection-manager';
import {
  TriggerBuilder,
  createTriggerFromConfig
} from './core/trigger-builder';
import { TriggerRegistry } from './core/registry';
import {
  TriggerConfig,
  TriggerHandle,
  Registry,
  ModelName,
  TriggerManagerOptions
} from './types';

// Re-export types
export * from './types';
export { TriggerPlugin } from './types';

// Export condition builders
export { sql, type Condition } from './core/conditions';

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
  for<M extends ModelName<Client>>(model: M): TriggerBuilder<Client, M> {
    const builder = new TriggerBuilder<Client>(this.connectionManager);
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
}

// Factory function
export function createTriggers<Client>(
  databaseUrl: string,
  options?: TriggerManagerOptions
): TriggerManager<Client> {
  return new TriggerManager<Client>(databaseUrl, options);
}
