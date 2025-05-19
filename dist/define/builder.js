"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TriggerBuilder = void 0;
const executor_1 = require("./executor");
const condition_builder_1 = require("../utils/condition-builder");
/**
 * Builder for defining and creating database triggers
 */
class TriggerBuilder {
    /**
     * Creates a new TriggerBuilder instance
     *
     * @param sql - A postgres.js client instance
     * @param modelName - The Prisma model (table) name
     */
    constructor(sql, modelName) {
        this.options = {};
        this.executor = new executor_1.TriggerExecutor(sql);
        this.options.modelName = modelName;
    }
    /**
     * Sets the trigger name
     *
     * @param name - The name for the trigger
     * @returns This builder instance for chaining
     */
    withName(name) {
        this.options.triggerName = name;
        return this;
    }
    /**
     * Sets when the trigger fires
     *
     * @param timing - The timing (BEFORE, AFTER, INSTEAD OF)
     * @returns This builder instance for chaining
     */
    withTiming(timing) {
        this.options.timing = timing;
        return this;
    }
    /**
     * Sets the events that activate the trigger
     *
     * @param events - The database events
     * @returns This builder instance for chaining
     */
    onEvents(...events) {
        this.options.events = events;
        return this;
    }
    /**
     * Sets whether the trigger runs once per row or once per statement
     *
     * @param forEach - ROW or STATEMENT
     * @returns This builder instance for chaining
     */
    withForEach(forEach) {
        this.options.forEach = forEach;
        return this;
    }
    /**
     * Sets the columns to watch for updates
     *
     * @param columns - The columns to watch
     * @returns This builder instance for chaining
     */
    watchColumns(...columns) {
        this.options.updateOfColumns = columns;
        return this;
    }
    /**
     * Sets the WHEN condition for the trigger using a raw SQL string
     *
     * @param condition - The SQL condition
     * @returns This builder instance for chaining
     */
    withCondition(condition) {
        this.options.whenCondition = condition;
        return this;
    }
    /**
     * Sets the WHEN condition for the trigger using a typesafe function
     *
     * @param condition - A function that defines the condition using NEW and OLD records
     * @returns This builder instance for chaining
     */
    withTypedCondition(condition) {
        this.options.whenCondition = (0, condition_builder_1.buildWhereCondition)(this.options.modelName, condition);
        return this;
    }
    /**
     * Sets the WHEN condition using a structured condition builder
     *
     * @returns A condition builder for this model
     */
    withConditionBuilder() {
        const builder = new condition_builder_1.ConditionBuilder();
        // Store the builder and update the condition when build() is called
        const originalBuild = builder.build;
        builder.build = () => {
            const condition = originalBuild.call(builder);
            this.options.whenCondition = condition;
            return condition;
        };
        const originalBuildOr = builder.buildOr;
        builder.buildOr = () => {
            const condition = originalBuildOr.call(builder);
            this.options.whenCondition = condition;
            return condition;
        };
        return builder;
    }
    /**
     * Sets the function to execute
     *
     * @param name - The function name
     * @param args - Arguments to pass to the function
     * @returns This builder instance for chaining
     */
    executeFunction(name, ...args) {
        this.options.functionName = name;
        this.options.functionArgs = args;
        return this;
    }
    /**
     * Creates and immediately registers a notify function
     *
     * @param functionName - The name for the function
     * @param channelName - The notification channel
     * @returns This builder instance for chaining
     */
    async withNotifyFunction(functionName, channelName) {
        await this.executor.createNotifyFunction(functionName, channelName);
        this.options.functionName = functionName;
        return this;
    }
    /**
     * Creates the trigger in the database
     *
     * @returns A promise that resolves when the trigger is created
     * @throws Error if required options are missing
     */
    async create() {
        // Validate required options
        if (!this.options.modelName) {
            throw new Error('Model name is required');
        }
        if (!this.options.triggerName) {
            throw new Error('Trigger name is required');
        }
        if (!this.options.timing) {
            throw new Error('Trigger timing is required');
        }
        if (!this.options.events || this.options.events.length === 0) {
            throw new Error('At least one event is required');
        }
        if (!this.options.functionName) {
            throw new Error('Function name is required');
        }
        // Create the trigger
        await this.executor.createTrigger(this.options);
    }
}
exports.TriggerBuilder = TriggerBuilder;
