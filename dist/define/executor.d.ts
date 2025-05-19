import postgres from 'postgres';
import { ModelName, DefineTriggerOptions } from '../types/core';
/**
 * Executes SQL statements for managing database triggers
 */
export declare class TriggerExecutor<Client> {
    private sql;
    private generator;
    /**
     * Creates a new TriggerExecutor instance
     *
     * @param sql - A postgres.js client instance
     */
    constructor(sql: postgres.Sql);
    /**
     * Creates a trigger in the database based on the provided options
     *
     * @param options - Options for defining the trigger
     * @returns A promise that resolves when the trigger is created
     */
    createTrigger<M extends ModelName<Client>>(options: DefineTriggerOptions<Client, M>): Promise<void>;
    /**
     * Drops a trigger from the database
     *
     * @param modelName - The Prisma model (table) name
     * @param triggerName - The name of the trigger to drop
     * @returns A promise that resolves when the trigger is dropped
     */
    dropTrigger<M extends ModelName<Client>>(modelName: M, triggerName: string): Promise<void>;
    /**
     * Creates a notification function in the database
     *
     * @param functionName - The name of the function to create
     * @param channelName - The notification channel name
     * @returns A promise that resolves when the function is created
     */
    createNotifyFunction(functionName: string, channelName: string): Promise<void>;
}
