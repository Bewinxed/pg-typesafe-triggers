// src/trigger/definition.ts
import postgres from 'postgres';
import {
  ModelName,
  ModelField,
  DefineTriggerOptions,
  TriggerOperation,
  TriggerTiming,
  TriggerForEach
} from '../types/core';
import { TriggerExecutor } from '../define/executor';
import {
  ConditionEvaluator,
  ConditionBuilder,
  buildWhereCondition
} from '../utils/condition-builder';
import { getTableName } from '../utils/prisma';
import { ChannelConfig } from '../notification/registry';

/**
 * First-class object representing a PostgreSQL trigger
 */
export class TriggerDefinition<Client, M extends ModelName<Client>> {
  private options: Partial<DefineTriggerOptions<Client, M>> = {};
  private executor: TriggerExecutor<Client>;
  private isCreated: boolean = false;
  private sql: postgres.Sql;

  /**
   * Creates a new TriggerDefinition instance
   *
   * @param sql - A postgres.js client instance
   * @param modelName - The Prisma model (table) name
   */
  constructor(sql: postgres.Sql, modelName: M) {
    this.sql = sql;
    this.executor = new TriggerExecutor<Client>(sql);
    this.options.modelName = modelName;
  }

  /**
   * Sets the trigger name
   *
   * @param name - The name for the trigger
   * @returns This instance for chaining
   */
  public withName(name: string): TriggerDefinition<Client, M> {
    this.options.triggerName = name;
    return this;
  }

  /**
   * Sets when the trigger fires
   *
   * @param timing - The timing (BEFORE, AFTER, INSTEAD OF)
   * @returns This instance for chaining
   */
  public withTiming(timing: TriggerTiming): TriggerDefinition<Client, M> {
    this.options.timing = timing;
    return this;
  }

  /**
   * Sets the events that activate the trigger
   *
   * @param events - The database events
   * @returns This instance for chaining
   */
  public onEvents(...events: TriggerOperation[]): TriggerDefinition<Client, M> {
    this.options.events = events;
    return this;
  }

  /**
   * Sets whether the trigger runs once per row or once per statement
   *
   * @param forEach - ROW or STATEMENT
   * @returns This instance for chaining
   */
  public withForEach(forEach: TriggerForEach): TriggerDefinition<Client, M> {
    this.options.forEach = forEach;
    return this;
  }

  /**
   * Sets the columns to watch for updates
   *
   * @param columns - The columns to watch
   * @returns This instance for chaining
   */
  public watchColumns(
    ...columns: Array<ModelField<Client, M>>
  ): TriggerDefinition<Client, M> {
    this.options.updateOfColumns = columns;
    return this;
  }

  /**
   * Sets the WHEN condition for the trigger using a raw SQL string
   *
   * @param condition - The SQL condition
   * @returns This instance for chaining
   */
  public rawCondition(condition: string): TriggerDefinition<Client, M> {
    this.options.whenCondition = condition;
    return this;
  }

  /**
   * Sets the WHEN condition for the trigger using a typesafe function
   * This is the primary method for defining conditions
   *
   * @param condition - A function that defines the condition using NEW and OLD records
   * @returns This instance for chaining
   */
  public withCondition(
    condition: ConditionEvaluator<Client, M>
  ): TriggerDefinition<Client, M> {
    this.options.whenCondition = buildWhereCondition<Client, M>(condition);
    return this;
  }

  /**
   * Sets the WHEN condition using a structured condition builder
   *
   * @returns A condition builder for this model
   */
  public conditionBuilder(): ConditionBuilder<Client, M> {
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
   * @returns This instance for chaining
   */
  public executeFunction(
    name: string,
    ...args: string[]
  ): TriggerDefinition<Client, M> {
    this.options.functionName = name;
    this.options.functionArgs = args;
    return this;
  }

  /**
   * Link the trigger to a notification channel
   *
   * @param channel - The channel config
   * @returns This instance for chaining
   */
  public notifyOn<T>(channel: ChannelConfig<T>): TriggerDefinition<Client, M> {
    this.options.functionName =
      channel.functionName || `${channel.name}_notify_func`;
    return this;
  }

  /**
   * Creates and immediately registers a notify function
   *
   * @param functionName - The name for the function
   * @param channelName - The notification channel
   * @returns This instance for chaining
   */
  public async withNotifyFunction(
    functionName: string,
    channelName: string
  ): Promise<TriggerDefinition<Client, M>> {
    await this.executor.createNotifyFunction(functionName, channelName);
    this.options.functionName = functionName;
    return this;
  }

  /**
   * Validates the trigger definition
   *
   * @throws Error if required options are missing
   */
  private validate(): void {
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
  }

  /**
   * Creates the trigger in the database
   *
   * @returns A promise that resolves when the trigger is created
   * @throws Error if required options are missing
   */
  public async create(): Promise<TriggerDefinition<Client, M>> {
    this.validate();

    // Add the table name to options
    const tableName = getTableName(String(this.options.modelName));
    this.options.tableName = tableName;

    // Create the trigger
    await this.executor.createTrigger(
      this.options as DefineTriggerOptions<Client, M>
    );

    this.isCreated = true;
    return this;
  }

  /**
   * Drops the trigger from the database
   *
   * @returns A promise that resolves when the trigger is dropped
   */
  public async drop(): Promise<void> {
    if (!this.options.tableName) {
      this.options.tableName = getTableName(String(this.options.modelName));
    }

    if (!this.options.triggerName) {
      throw new Error('Trigger name is required to drop a trigger');
    }

    await this.executor.dropTrigger(
      this.options.tableName,
      this.options.triggerName
    );

    this.isCreated = false;
  }

  /**
   * Checks if the trigger exists in the database
   *
   * @returns A promise that resolves to true if the trigger exists
   */
  public async exists(): Promise<boolean> {
    if (!this.options.tableName) {
      this.options.tableName = getTableName(String(this.options.modelName));
    }

    if (!this.options.triggerName) {
      throw new Error('Trigger name is required to check if a trigger exists');
    }

    const result = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = ${this.options.triggerName}
        AND tgrelid = (SELECT oid FROM pg_class WHERE relname = ${this.options.tableName})
      ) as exists
    `;

    return result[0]?.exists || false;
  }
}
