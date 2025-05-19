"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TriggerExecutor = void 0;
const generator_1 = require("./generator");
/**
 * Executes SQL statements for managing database triggers
 */
class TriggerExecutor {
    /**
     * Creates a new TriggerExecutor instance
     *
     * @param sql - A postgres.js client instance
     */
    constructor(sql) {
        this.sql = sql;
        this.generator = new generator_1.TriggerSQLGenerator();
    }
    /**
     * Creates a trigger in the database based on the provided options
     *
     * @param options - Options for defining the trigger
     * @returns A promise that resolves when the trigger is created
     */
    async createTrigger(options) {
        const sql = this.generator.generateCreateTriggerSQL(options);
        await this.sql.unsafe(sql);
    }
    /**
     * Drops a trigger from the database
     *
     * @param modelName - The Prisma model (table) name
     * @param triggerName - The name of the trigger to drop
     * @returns A promise that resolves when the trigger is dropped
     */
    async dropTrigger(modelName, triggerName) {
        const sql = this.generator.generateDropTriggerSQL(modelName, triggerName);
        await this.sql.unsafe(sql);
    }
    /**
     * Creates a notification function in the database
     *
     * @param functionName - The name of the function to create
     * @param channelName - The notification channel name
     * @returns A promise that resolves when the function is created
     */
    async createNotifyFunction(functionName, channelName) {
        const sql = this.generator.generateNotifyFunctionSQL(functionName, channelName);
        await this.sql.unsafe(sql);
    }
}
exports.TriggerExecutor = TriggerExecutor;
