import postgres from 'postgres';
import { ModelName, ModelField, TriggerOperation, TriggerTiming, TriggerForEach } from '../types/core';
import { ConditionEvaluator, ConditionBuilder } from '../utils/condition-builder';
/**
 * Builder for defining and creating database triggers
 */
export declare class TriggerBuilder<Client, M extends ModelName<Client>> {
    private options;
    private executor;
    /**
     * Creates a new TriggerBuilder instance
     *
     * @param sql - A postgres.js client instance
     * @param modelName - The Prisma model (table) name
     */
    constructor(sql: postgres.Sql, modelName: M);
    /**
     * Sets the trigger name
     *
     * @param name - The name for the trigger
     * @returns This builder instance for chaining
     */
    withName(name: string): TriggerBuilder<Client, M>;
    /**
     * Sets when the trigger fires
     *
     * @param timing - The timing (BEFORE, AFTER, INSTEAD OF)
     * @returns This builder instance for chaining
     */
    withTiming(timing: TriggerTiming): TriggerBuilder<Client, M>;
    /**
     * Sets the events that activate the trigger
     *
     * @param events - The database events
     * @returns This builder instance for chaining
     */
    onEvents(...events: TriggerOperation[]): TriggerBuilder<Client, M>;
    /**
     * Sets whether the trigger runs once per row or once per statement
     *
     * @param forEach - ROW or STATEMENT
     * @returns This builder instance for chaining
     */
    withForEach(forEach: TriggerForEach): TriggerBuilder<Client, M>;
    /**
     * Sets the columns to watch for updates
     *
     * @param columns - The columns to watch
     * @returns This builder instance for chaining
     */
    watchColumns(...columns: Array<ModelField<Client, M>>): TriggerBuilder<Client, M>;
    /**
     * Sets the WHEN condition for the trigger using a raw SQL string
     *
     * @param condition - The SQL condition
     * @returns This builder instance for chaining
     */
    withCondition(condition: string): TriggerBuilder<Client, M>;
    /**
     * Sets the WHEN condition for the trigger using a typesafe function
     *
     * @param condition - A function that defines the condition using NEW and OLD records
     * @returns This builder instance for chaining
     */
    withTypedCondition(condition: ConditionEvaluator<Client, M>): TriggerBuilder<Client, M>;
    /**
     * Sets the WHEN condition using a structured condition builder
     *
     * @returns A condition builder for this model
     */
    withConditionBuilder(): ConditionBuilder<Client, M>;
    /**
     * Sets the function to execute
     *
     * @param name - The function name
     * @param args - Arguments to pass to the function
     * @returns This builder instance for chaining
     */
    executeFunction(name: string, ...args: string[]): TriggerBuilder<Client, M>;
    /**
     * Creates and immediately registers a notify function
     *
     * @param functionName - The name for the function
     * @param channelName - The notification channel
     * @returns This builder instance for chaining
     */
    withNotifyFunction(functionName: string, channelName: string): Promise<TriggerBuilder<Client, M>>;
    /**
     * Creates the trigger in the database
     *
     * @returns A promise that resolves when the trigger is created
     * @throws Error if required options are missing
     */
    create(): Promise<void>;
}
