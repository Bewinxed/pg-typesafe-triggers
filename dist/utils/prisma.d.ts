import { PrismaModelName } from '../types/core';
/**
 * Utility functions for working with Prisma models and types
 */
export declare class PrismaUtils {
    /**
     * Gets all model names from the Prisma client
     *
     * @returns An array of model names
     */
    static getModelNames(): PrismaModelName[];
    /**
     * Gets all field names for a given model
     *
     * @template T - The Prisma model name
     * @param modelName - The model name to get fields for
     * @returns An array of field names (as strings)
     */
    static getModelFields<T extends PrismaModelName>(modelName: T): string[];
    /**
     * Checks if a table exists in the database
     *
     * @param sql - A postgres.js client instance
     * @param modelName - The model name to check
     * @returns A promise that resolves to true if the table exists
     */
    static tableExists(sql: any, modelName: PrismaModelName): Promise<boolean>;
}
