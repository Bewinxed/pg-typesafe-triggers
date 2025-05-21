// src/trigger/index.ts
import postgres from 'postgres';
import {
  ModelName,
  TriggerOperation,
  TriggerTiming,
  TriggerForEach,
  DefineTriggerOptions,
  ModelField
} from '../types/core';
import { SubscriptionClient } from '../subscribe/client';
import { NotificationRegistry } from '../notification/registry';
import { TriggerExecutor } from '../define/executor';
import { getTableName } from '../utils/prisma';
import {
  ConditionEvaluator,
  buildWhereCondition
} from '../utils/condition-builder';

// Union type for condition - accepts both function and string
export type TriggerCondition<Client, M extends ModelName<Client>> =
  | ConditionEvaluator<Client, M>
  | string;

/**
 * Manager for PostgreSQL triggers
 */
export class PgTriggerManager<Client> {
  private sql: postgres.Sql;
  private executor: TriggerExecutor<Client>;
  private subscriptionClient: SubscriptionClient<Client>;

  /**
   * Creates a new PgTriggerManager instance
   *
   * @param sql - A postgres.js client instance
   */
  constructor(sql: postgres.Sql) {
    this.sql = sql;
    this.executor = new TriggerExecutor<Client>(sql);
    this.subscriptionClient = new SubscriptionClient<Client>(sql);
  }

  /**
   * Creates a notification registry for strongly-typed events
   *
   * @returns A new notification registry
   */
  public createRegistry(): NotificationRegistry<Client> {
    return new NotificationRegistry<Client>();
  }

  /**
   * Creates a client builder from a notification registry
   *
   * @param registry - The notification registry
   * @returns A notification client builder
   */
  public createClient<ChannelMap extends Record<string, any>>(
    registry: NotificationRegistry<Client, ChannelMap>
  ) {
    return registry.createClientBuilder(this);
  }

  /**
   * Define and create a trigger with a complete configuration object
   *
   * @param options - Complete trigger configuration
   * @returns A TriggerDefinition object
   */
  public defineTrigger<M extends ModelName<Client>>(
    options: Omit<
      DefineTriggerOptions<Client, M>,
      'tableName' | 'whenCondition'
    > & {
      condition?: TriggerCondition<Client, M>;
    }
  ): TriggerDefinition<Client, M> {
    const definition = new TriggerDefinition<Client, M>(this.sql);

    // Set all properties from options
    if (options.modelName) {
      definition.modelName = options.modelName;
    }

    if (options.triggerName) {
      definition.triggerName = options.triggerName;
    }

    if (options.timing) {
      definition.timing = options.timing;
    }

    if (options.events) {
      definition.events = options.events;
    }

    if (options.forEach) {
      definition.forEach = options.forEach;
    }

    if (options.updateOfColumns) {
      definition.updateOfColumns = options.updateOfColumns;
    }

    // Handle condition - can be either string or function
    if (options.condition) {
      definition.setCondition(options.condition);
    }

    if (options.functionName) {
      definition.functionName = options.functionName;
      definition.functionArgs = options.functionArgs || [];
    }

    return definition;
  }

  /**
   * Drops a trigger from the database
   *
   * @param modelName - The model the trigger is on
   * @param triggerName - The name of the trigger to drop
   * @returns A promise that resolves when the trigger is dropped
   */
  public async dropTrigger<M extends ModelName<Client>>(
    modelName: M,
    triggerName: string
  ): Promise<void> {
    // Get the actual table name
    const tableName = getTableName(String(modelName));

    // Pass the resolved table name
    await this.executor.dropTrigger(tableName, triggerName);
  }

  /**
   * Creates a notification function
   *
   * @param functionName - Name for the function
   * @param channelName - The notification channel
   * @returns A promise that resolves when the function is created
   */
  public async createNotifyFunction(
    functionName: string,
    channelName: string
  ): Promise<void> {
    await this.executor.createNotifyFunction(functionName, channelName);
  }

  /**
   * Gets access to the subscription client
   *
   * @returns The SubscriptionClient instance
   */
  public getSubscriptionClient(): SubscriptionClient<Client> {
    return this.subscriptionClient;
  }
}

/**
 * First-class object representing a PostgreSQL trigger
 */
export class TriggerDefinition<Client, M extends ModelName<Client>> {
  // Public properties for direct configuration
  public modelName!: M;
  public triggerName!: string;
  public timing!: TriggerTiming;
  public events!: TriggerOperation[];
  public forEach?: TriggerForEach;
  public updateOfColumns?: Array<ModelField<Client, M>>;
  public whenCondition?: string;
  public functionName!: string;
  public functionArgs: string[] = [];

  private executor: TriggerExecutor<Client>;
  private sql: postgres.Sql;
  private isCreated: boolean = false;
  private tableName?: string;

  /**
   * Creates a new TriggerDefinition instance
   */
  constructor(sql: postgres.Sql) {
    this.sql = sql;
    this.executor = new TriggerExecutor<Client>(sql);
  }

  /**
   * Sets the condition for the trigger - accepts either a function or raw SQL
   *
   * @param condition - Function or SQL string for the condition
   */
  public setCondition(condition: TriggerCondition<Client, M>): void {
    if (typeof condition === 'string') {
      this.whenCondition = condition;
    } else {
      this.whenCondition = buildWhereCondition<Client, M>(condition);
    }
  }

  /**
   * Validates the trigger definition
   *
   * @throws Error if required properties are missing
   */
  private validate(): void {
    if (!this.modelName) {
      throw new Error('Model name is required');
    }

    if (!this.triggerName) {
      throw new Error('Trigger name is required');
    }

    if (!this.timing) {
      throw new Error('Trigger timing is required');
    }

    if (!this.events || this.events.length === 0) {
      throw new Error('At least one event is required');
    }

    if (!this.functionName) {
      throw new Error('Function name is required');
    }
  }

  /**
   * Creates the trigger in the database
   *
   * @returns A promise that resolves to this instance
   * @throws Error if required properties are missing
   */
  public async create(): Promise<TriggerDefinition<Client, M>> {
    this.validate();

    // Get the table name
    this.tableName = getTableName(String(this.modelName));

    // Create the options object for the executor
    const options: DefineTriggerOptions<Client, M> = {
      modelName: this.modelName,
      tableName: this.tableName,
      triggerName: this.triggerName,
      timing: this.timing,
      events: this.events,
      functionName: this.functionName,
      functionArgs: this.functionArgs
    };

    if (this.forEach) {
      options.forEach = this.forEach;
    }

    if (this.updateOfColumns) {
      options.updateOfColumns = this.updateOfColumns;
    }

    if (this.whenCondition) {
      options.whenCondition = this.whenCondition;
    }

    // Create the trigger
    await this.executor.createTrigger(options);

    this.isCreated = true;
    return this;
  }

  /**
   * Drops the trigger from the database
   *
   * @returns A promise that resolves when the trigger is dropped
   */
  public async drop(): Promise<void> {
    if (!this.tableName) {
      this.tableName = getTableName(String(this.modelName));
    }

    if (!this.triggerName) {
      throw new Error('Trigger name is required to drop a trigger');
    }

    await this.executor.dropTrigger(this.tableName, this.triggerName);

    this.isCreated = false;
  }

  /**
   * Checks if the trigger exists in the database
   *
   * @returns A promise that resolves to true if the trigger exists
   */
  public async exists(): Promise<boolean> {
    if (!this.tableName) {
      this.tableName = getTableName(String(this.modelName));
    }

    if (!this.triggerName) {
      throw new Error('Trigger name is required to check if a trigger exists');
    }

    const result = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = ${this.triggerName}
        AND tgrelid = (SELECT oid FROM pg_class WHERE relname = ${this.tableName})
      ) as exists
    `;

    return result[0]?.exists || false;
  }
}
