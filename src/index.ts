// src/index.ts (modified)
// Main entry point for the library
import postgres from 'postgres';
import {
  ModelName,
  TriggerOperation,
  TriggerTiming,
  TriggerForEach,
  PrismaClientWithDMMF
} from './types/core';
import { TriggerSQLGenerator } from './define/generator';
import { TriggerExecutor } from './define/executor';
import { TriggerBuilder } from './define/builder';
import { SubscriptionClient } from './subscribe/client';
import { getTableName } from './utils/prisma';
import {
  NotificationRegistry,
  NotificationClientBuilder,
  EnhancedTriggerBuilder
} from './notification/registry';

// Export types
export * from './types/core';
export * from './notification/registry';

// Export trigger definition components
export { TriggerSQLGenerator } from './define/generator';
export { TriggerExecutor } from './define/executor';
export { TriggerBuilder } from './define/builder';

// Export subscription components
export { SubscriptionClient } from './subscribe/client';

// Export condition builder
export {
  buildWhereCondition,
  ConditionBuilder,
  type ConditionEvaluator
} from './utils/condition-builder';

/**
 * Main client for the pg-typesafe-triggers library
 */
export class PgTypesafeTriggers<Client> {
  private sql: postgres.Sql;
  private executor: TriggerExecutor<Client>;
  private subscriptionClient: SubscriptionClient<Client>;

  /**
   * Creates a new PgTypesafeTriggers instance
   *
   * @param sql - A postgres.js client instance
   *
   */
  constructor(sql: postgres.Sql) {
    this.sql = sql;
    this.executor = new TriggerExecutor<Client>(sql);
    this.subscriptionClient = new SubscriptionClient<Client>(sql);
  }

  /**
   * Creates a notification registry for strongly-typed events
   *
   * @returns A new notification registry
   */
  public createRegistry(): NotificationRegistry<Client> {
    return new NotificationRegistry<Client>();
  }

  /**
   * Creates a client builder from a notification registry
   *
   * @param registry - The notification registry
   * @returns A notification client builder
   */
  public createClient<ChannelMap extends Record<string, any>>(
    registry: NotificationRegistry<Client, ChannelMap>
  ): NotificationClientBuilder<Client, ChannelMap> {
    return new NotificationClientBuilder<Client, ChannelMap>(this, registry);
  }

  /**
   * Creates a builder for defining a trigger on the given model
   *
   * @param modelName - The model to create a trigger for
   * @param registry - Optional registry for typed notifications
   * @returns A TriggerBuilder instance
   */
  public defineTrigger<
    M extends ModelName<Client>,
    R extends Record<string, any> = {}
  >(
    modelName: M,
    registry?: NotificationRegistry<Client, R>
  ): typeof registry extends undefined
    ? TriggerBuilder<Client, M>
    : EnhancedTriggerBuilder<Client, M, R> {
    const baseBuilder = new TriggerBuilder<Client, M>(this.sql, modelName);

    if (registry) {
      return new EnhancedTriggerBuilder<Client, M, R>(
        baseBuilder,
        registry as NotificationRegistry<Client, R>
      ) as any;
    }

    return baseBuilder as any;
  }

  /**
   * Drops a trigger from the database
   *
   * @param modelName - The model the trigger is on
   * @param triggerName - The name of the trigger to drop
   * @returns A promise that resolves when the trigger is dropped
   */
  public async dropTrigger<M extends ModelName<Client>>(
    modelName: M,
    triggerName: string
  ): Promise<void> {
    // Get the actual table name using the same function as for creation
    const tableName = getTableName(String(modelName));

    // Pass the resolved table name instead of the model name
    await this.executor.dropTrigger(tableName, triggerName);
  }

  /**
   * Creates a notification function
   *
   * @param functionName - Name for the function
   * @param channelName - The notification channel
   * @returns A promise that resolves when the function is created
   */
  public async createNotifyFunction(
    functionName: string,
    channelName: string
  ): Promise<void> {
    await this.executor.createNotifyFunction(functionName, channelName);
  }

  /**
   * Gets access to the subscription client
   *
   * @returns The SubscriptionClient instance
   */
  public getSubscriptionClient(): SubscriptionClient<Client> {
    return this.subscriptionClient;
  }
}
