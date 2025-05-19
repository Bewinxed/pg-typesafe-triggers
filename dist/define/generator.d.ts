import { ModelName, DefineTriggerOptions } from '../types/core';
/**
 * Generates SQL statements for creating database triggers
 */
export declare class TriggerSQLGenerator<Client> {
    /**
     * Generates a CREATE TRIGGER SQL statement from the provided options
     *
     * @param options - Options for defining the trigger
     * @returns The SQL string for creating the trigger
     */
    generateCreateTriggerSQL<M extends ModelName<Client>>(options: DefineTriggerOptions<Client, M>): string;
    /**
     * Generates a DROP TRIGGER SQL statement
     *
     * @param modelName - The Prisma model (table) name
     * @param triggerName - The name of the trigger to drop
     * @returns The SQL string for dropping the trigger
     */
    generateDropTriggerSQL<M extends ModelName<Client>>(modelName: M, triggerName: string): string;
    /**
     * Generates a template for a PL/pgSQL function that sends notifications
     *
     * @param functionName - The name of the function
     * @param channelName - The notification channel name
     * @returns The SQL string for creating the function
     */
    generateNotifyFunctionSQL(functionName: string, channelName: string): string;
}
