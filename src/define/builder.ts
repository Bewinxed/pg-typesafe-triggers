// src/define/builder.ts
import postgres from 'postgres';
import {
  ModelName,
  ModelField,
  DefineTriggerOptions,
  TriggerOperation,
  TriggerTiming,
  TriggerForEach
} from '../types/core';
import { TriggerExecutor } from './executor';
import {
  ConditionEvaluator,
  ConditionBuilder,
  buildWhereCondition
} from '../utils/condition-builder';
import { getTableName } from '../utils/prisma';

/**
 * Builder for defining and creating database triggers
 */
export class TriggerBuilder<Client, M extends ModelName<Client>> {
  private options: Partial<DefineTriggerOptions<Client, M>> = {};
  private executor: TriggerExecutor<Client>;

  /**
   * Creates a new TriggerBuilder instance
   *
   * @param sql - A postgres.js client instance
   * @param modelName - The Prisma model (table) name
   * @param prismaClient - The Prisma client instance
   */
  constructor(sql: postgres.Sql, modelName: M) {
    this.executor = new TriggerExecutor<Client>(sql);
    this.options.modelName = modelName;
  }

  /**bun test
   * Sets the trigger name
   *
   * @param name - The name for the trigger
   * @returns This builder instance for chaining
   */
  public withName(name: string): TriggerBuilder<Client, M> {
    this.options.triggerName = name;
    return this;
  }

  /**
   * Sets when the trigger fires
   *
   * @param timing - The timing (BEFORE, AFTER, INSTEAD OF)
   * @returns This builder instance for chaining
   */
  public withTiming(timing: TriggerTiming): TriggerBuilder<Client, M> {
    this.options.timing = timing;
    return this;
  }

  /**
   * Sets the events that activate the trigger
   *
   * @param events - The database events
   * @returns This builder instance for chaining
   */
  public onEvents(...events: TriggerOperation[]): TriggerBuilder<Client, M> {
    this.options.events = events;
    return this;
  }

  /**
   * Sets whether the trigger runs once per row or once per statement
   *
   * @param forEach - ROW or STATEMENT
   * @returns This builder instance for chaining
   */
  public withForEach(forEach: TriggerForEach): TriggerBuilder<Client, M> {
    this.options.forEach = forEach;
    return this;
  }

  /**
   * Sets the columns to watch for updates
   *
   * @param columns - The columns to watch
   * @returns This builder instance for chaining
   */
  public watchColumns(
    ...columns: Array<ModelField<Client, M>>
  ): TriggerBuilder<Client, M> {
    this.options.updateOfColumns = columns;
    return this;
  }

  /**
   * Sets the WHEN condition for the trigger using a raw SQL string
   *
   * @param condition - The SQL condition
   * @returns This builder instance for chaining
   */
  public withCondition(condition: string): TriggerBuilder<Client, M> {
    this.options.whenCondition = condition;
    return this;
  }

  /**
   * Sets the WHEN condition for the trigger using a typesafe function
   *
   * @param condition - A function that defines the condition using NEW and OLD records
   * @returns This builder instance for chaining
   */
  public withTypedCondition(
    condition: ConditionEvaluator<Client, M>
  ): TriggerBuilder<Client, M> {
    this.options.whenCondition = buildWhereCondition<Client, M>(condition);
    return this;
  }

  /**
   * Sets the WHEN condition using a structured condition builder
   *
   * @returns A condition builder for this model
   */
  public withConditionBuilder(): ConditionBuilder<Client, M> {
    const builder = new ConditionBuilder<Client, M>();

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
  public executeFunction(
    name: string,
    ...args: string[]
  ): TriggerBuilder<Client, M> {
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
  public async withNotifyFunction(
    functionName: string,
    channelName: string
  ): Promise<TriggerBuilder<Client, M>> {
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
  public async create(): Promise<void> {
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

    const tableName = getTableName(String(this.options.modelName));

    // Add the table name to options
    this.options.tableName = tableName;

    // Create the trigger
    await this.executor.createTrigger(
      this.options as DefineTriggerOptions<Client, M>
    );
  }
}
