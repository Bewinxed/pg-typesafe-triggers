"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaUtils = void 0;
// src/utils/prisma.ts
const client_1 = require("@prisma/client");
/**
 * Utility functions for working with Prisma models and types
 */
class PrismaUtils {
    /**
     * Gets all model names from the Prisma client
     *
     * @returns An array of model names
     */
    static getModelNames() {
        return Object.values(client_1.Prisma.ModelName);
    }
    /**
     * Gets all field names for a given model
     *
     * @template T - The Prisma model name
     * @param modelName - The model name to get fields for
     * @returns An array of field names (as strings)
     */
    static getModelFields(modelName) {
        // This is a simplified implementation - in a real-world scenario,
        // you would need to introspect Prisma's generated types more deeply
        // Example for 'Item' model based on our schema
        if (modelName === 'Item') {
            return ['id', 'name', 'status', 'listId'];
        }
        // Example for 'List' model based on our schema
        if (modelName === 'List') {
            return ['id', 'name'];
        }
        return [];
    }
    /**
     * Checks if a table exists in the database
     *
     * @param sql - A postgres.js client instance
     * @param modelName - The model name to check
     * @returns A promise that resolves to true if the table exists
     */
    static async tableExists(sql, modelName) {
        const result = await sql `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = ${modelName.toLowerCase()}
      );
    `;
        return result[0]?.exists || false;
    }
}
exports.PrismaUtils = PrismaUtils;
