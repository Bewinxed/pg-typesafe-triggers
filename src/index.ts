// src/index.ts
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

// Export types
export * from './types/core';

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
   * Creates a builder for defining a trigger on the given model
   *
   * @param modelName - The model to create a trigger for
   * @returns A TriggerBuilder instance
   */
  public defineTrigger<M extends ModelName<Client>>(
    modelName: M
  ): TriggerBuilder<Client, M> {
    return new TriggerBuilder<Client, M>(this.sql, modelName);
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
