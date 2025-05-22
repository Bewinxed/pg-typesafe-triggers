// src/trigger-manager.ts
import postgres from 'postgres';
import {
  ModelName,
  ModelField,
  TriggerOperation,
  TriggerTiming,
  TriggerForEach,
  DefineTriggerOptions,
  NotificationPayload
} from '../types/core';
import { TriggerExecutor } from '../define/executor';
import { SubscriptionClient } from '../subscribe/client';
import {
  ConditionEvaluator,
  buildWhereCondition
} from '../utils/condition-builder';
import { getTableName } from '../utils/prisma';

type TriggerCondition<Client, M extends ModelName<Client>> =
  | ConditionEvaluator<Client, M>
  | string;

type NotificationHandler<T> = (payload: T) => void | Promise<void>;

/**
 * Individual trigger manager for defining and managing single triggers
 */
export class TriggerManager<Client> {
  private sql: postgres.Sql;
  private executor: TriggerExecutor<Client>;
  private subscriptionClient: SubscriptionClient<Client>;

  // Trigger definition state
  private triggerDef: Partial<DefineTriggerOptions<Client, any>> = {};
  private channelName?: string;
  private isSetup = false;
  private isListening = false;
  private handlers: Map<string, Set<NotificationHandler<any>>> = new Map();

  // Registry integration
  private registry?: any; // Will be typed properly when Registry is created
  private registryChannelName?: string;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
    this.executor = new TriggerExecutor<Client>(sql);
    this.subscriptionClient = new SubscriptionClient<Client>(sql);
  }

  /**
   * Define a trigger for a specific model
   */
  defineTrigger<M extends ModelName<Client>>(
    modelName: M
  ): TriggerDefinition<Client, M> {
    this.triggerDef.modelName = modelName;
    return new TriggerDefinition<Client, M>(this);
  }

  /**
   * Set up the database (create functions and triggers)
   */
  async setupDatabase(): Promise<void> {
    if (this.isSetup) return;

    this.validateDefinition();

    // Create notification function if we have a channel
    if (this.channelName) {
      const functionName =
        this.triggerDef.functionName || `${this.channelName}_notify_func`;
      await this.executor.createNotifyFunction(functionName, this.channelName);
      this.triggerDef.functionName = functionName;
    }

    // Get table name and create trigger
    const tableName = getTableName(String(this.triggerDef.modelName));
    this.triggerDef.tableName = tableName;

    await this.executor.createTrigger(
      this.triggerDef as DefineTriggerOptions<Client, any>
    );
    this.isSetup = true;
  }

  /**
   * Start listening to notifications
   */
  async startListening(): Promise<void> {
    if (this.isListening || !this.channelName) return;

    await this.subscriptionClient.subscribe(this.channelName, {
      onNotification: (payload: any) => {
        const handlers = this.handlers.get(this.channelName!);
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(payload);
            } catch (error) {
              console.error(`Error in trigger handler:`, error);
            }
          });
        }
      }
    });

    this.isListening = true;
  }

  /**
   * Stop listening to notifications
   */
  async stopListening(): Promise<void> {
    if (!this.isListening || !this.channelName) return;

    await this.subscriptionClient.unsubscribe(this.channelName);
    this.isListening = false;
  }

  /**
   * Add a notification handler
   */
  on<T = any>(channel: string, handler: NotificationHandler<T>): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);
  }

  /**
   * Remove a notification handler
   */
  off<T = any>(channel: string, handler: NotificationHandler<T>): void {
    const handlers = this.handlers.get(channel);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Hook this trigger to a registry for centralized management
   */
  useRegistry(registry: any, channelName: string): void {
    this.registry = registry;
    this.registryChannelName = channelName;
    registry.addTrigger(this, channelName);
  }

  /**
   * Drop the trigger from the database
   */
  async dropTrigger(): Promise<void> {
    if (!this.triggerDef.modelName || !this.triggerDef.triggerName) return;

    const tableName = getTableName(String(this.triggerDef.modelName));
    await this.executor.dropTrigger(tableName, this.triggerDef.triggerName);
    this.isSetup = false;
  }

  /**
   * Get the current status
   */
  getStatus() {
    return {
      isSetup: this.isSetup,
      isListening: this.isListening,
      channelName: this.channelName,
      triggerName: this.triggerDef.triggerName,
      modelName: this.triggerDef.modelName
    };
  }

  private validateDefinition(): void {
    if (!this.triggerDef.modelName) throw new Error('Model name is required');
    if (!this.triggerDef.triggerName)
      throw new Error('Trigger name is required');
    if (!this.triggerDef.timing) throw new Error('Trigger timing is required');
    if (!this.triggerDef.events?.length)
      throw new Error('At least one event is required');
  }

  // Internal methods for the definition builder
  internal = {
    setTriggerDef: (def: Partial<DefineTriggerOptions<Client, any>>) => {
      Object.assign(this.triggerDef, def);
    },
    setChannelName: (name: string) => {
      this.channelName = name;
    },
    getTriggerDef: () => this.triggerDef,
    getExecutor: () => this.executor
  };
}

/**
 * Fluent builder for trigger definition
 */
export class TriggerDefinition<Client, M extends ModelName<Client>> {
  constructor(private manager: TriggerManager<Client>) {}

  withName(name: string): this {
    this.manager.internal.setTriggerDef({ triggerName: name });
    return this;
  }

  withTiming(timing: TriggerTiming): this {
    this.manager.internal.setTriggerDef({ timing });
    return this;
  }

  onEvents(...events: TriggerOperation[]): this {
    this.manager.internal.setTriggerDef({ events });
    return this;
  }

  withForEach(forEach: TriggerForEach): this {
    this.manager.internal.setTriggerDef({ forEach });
    return this;
  }

  watchColumns(...columns: Array<ModelField<Client, M>>): this {
    this.manager.internal.setTriggerDef({ updateOfColumns: columns });
    return this;
  }

  withCondition(condition: TriggerCondition<Client, M>): this {
    const whenCondition =
      typeof condition === 'string'
        ? condition
        : buildWhereCondition<Client, M>(condition);
    this.manager.internal.setTriggerDef({ whenCondition });
    return this;
  }

  executeFunction(name: string, ...args: string[]): this {
    this.manager.internal.setTriggerDef({
      functionName: name,
      functionArgs: args
    });
    return this;
  }

  /**
   * Set up notification on a channel
   */
  notifyOn(channelName: string): this {
    this.manager.internal.setChannelName(channelName);
    const functionName = `${channelName}_notify_func`;
    this.manager.internal.setTriggerDef({ functionName });
    return this;
  }

  /**
   * Convenience method to do both setupDatabase and startListening
   */
  async setup(): Promise<TriggerManager<Client>> {
    await this.manager.setupDatabase();
    await this.manager.startListening();
    return this.manager;
  }

  /**
   * Just setup the database part
   */
  async setupDatabase(): Promise<TriggerManager<Client>> {
    await this.manager.setupDatabase();
    return this.manager;
  }

  /**
   * Get the manager instance for further operations
   */
  getManager(): TriggerManager<Client> {
    return this.manager;
  }
}
