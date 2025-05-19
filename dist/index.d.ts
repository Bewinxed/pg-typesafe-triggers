import postgres from 'postgres';
import { ModelName } from './types/core';
import { TriggerBuilder } from './define/builder';
import { SubscriptionClient } from './subscribe/client';
export * from './types/core';
export { TriggerSQLGenerator } from './define/generator';
export { TriggerExecutor } from './define/executor';
export { TriggerBuilder } from './define/builder';
export { SubscriptionClient } from './subscribe/client';
export { buildWhereCondition, ConditionBuilder, type ConditionEvaluator } from './utils/condition-builder';
/**
 * Main client for the pg-typesafe-triggers library
 */
export declare class PgTypesafeTriggers<Client> {
    private sql;
    private executor;
    private subscriptionClient;
    /**
     * Creates a new PgTypesafeTriggers instance
     *
     * @param sql - A postgres.js client instance
     */
    constructor(sql: postgres.Sql);
    /**
     * Creates a builder for defining a trigger on the given model
     *
     * @param modelName - The model to create a trigger for
     * @returns A TriggerBuilder instance
     */
    defineTrigger<M extends ModelName<Client>>(modelName: M): TriggerBuilder<Client, M>;
    /**
     * Drops a trigger from the database
     *
     * @param modelName - The model the trigger is on
     * @param triggerName - The name of the trigger to drop
     * @returns A promise that resolves when the trigger is dropped
     */
    dropTrigger<M extends ModelName<Client>>(modelName: M, triggerName: string): Promise<void>;
    /**
     * Creates a notification function
     *
     * @param functionName - Name for the function
     * @param channelName - The notification channel
     * @returns A promise that resolves when the function is created
     */
    createNotifyFunction(functionName: string, channelName: string): Promise<void>;
    /**
     * Gets access to the subscription client
     *
     * @returns The SubscriptionClient instance
     */
    getSubscriptionClient(): SubscriptionClient<Client>;
}
