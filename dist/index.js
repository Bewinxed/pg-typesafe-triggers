"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgTypesafeTriggers = exports.ConditionBuilder = exports.buildWhereCondition = exports.SubscriptionClient = exports.TriggerBuilder = exports.TriggerExecutor = exports.TriggerSQLGenerator = void 0;
const executor_1 = require("./define/executor");
const builder_1 = require("./define/builder");
const client_1 = require("./subscribe/client");
// Export types
__exportStar(require("./types/core"), exports);
// Export trigger definition components
var generator_1 = require("./define/generator");
Object.defineProperty(exports, "TriggerSQLGenerator", { enumerable: true, get: function () { return generator_1.TriggerSQLGenerator; } });
var executor_2 = require("./define/executor");
Object.defineProperty(exports, "TriggerExecutor", { enumerable: true, get: function () { return executor_2.TriggerExecutor; } });
var builder_2 = require("./define/builder");
Object.defineProperty(exports, "TriggerBuilder", { enumerable: true, get: function () { return builder_2.TriggerBuilder; } });
// Export subscription components
var client_2 = require("./subscribe/client");
Object.defineProperty(exports, "SubscriptionClient", { enumerable: true, get: function () { return client_2.SubscriptionClient; } });
// Export condition builder
var condition_builder_1 = require("./utils/condition-builder");
Object.defineProperty(exports, "buildWhereCondition", { enumerable: true, get: function () { return condition_builder_1.buildWhereCondition; } });
Object.defineProperty(exports, "ConditionBuilder", { enumerable: true, get: function () { return condition_builder_1.ConditionBuilder; } });
/**
 * Main client for the pg-typesafe-triggers library
 */
class PgTypesafeTriggers {
    /**
     * Creates a new PgTypesafeTriggers instance
     *
     * @param sql - A postgres.js client instance
     */
    constructor(sql) {
        this.sql = sql;
        this.executor = new executor_1.TriggerExecutor(sql);
        this.subscriptionClient = new client_1.SubscriptionClient(sql);
    }
    /**
     * Creates a builder for defining a trigger on the given model
     *
     * @param modelName - The model to create a trigger for
     * @returns A TriggerBuilder instance
     */
    defineTrigger(modelName) {
        return new builder_1.TriggerBuilder(this.sql, modelName);
    }
    /**
     * Drops a trigger from the database
     *
     * @param modelName - The model the trigger is on
     * @param triggerName - The name of the trigger to drop
     * @returns A promise that resolves when the trigger is dropped
     */
    async dropTrigger(modelName, triggerName) {
        await this.executor.dropTrigger(modelName, triggerName);
    }
    /**
     * Creates a notification function
     *
     * @param functionName - Name for the function
     * @param channelName - The notification channel
     * @returns A promise that resolves when the function is created
     */
    async createNotifyFunction(functionName, channelName) {
        await this.executor.createNotifyFunction(functionName, channelName);
    }
    /**
     * Gets access to the subscription client
     *
     * @returns The SubscriptionClient instance
     */
    getSubscriptionClient() {
        return this.subscriptionClient;
    }
}
exports.PgTypesafeTriggers = PgTypesafeTriggers;
