// src/registry.ts
import postgres from 'postgres';
import {
  ModelName,
  TriggerOperation,
  TriggerTiming,
  NotificationPayload,
  ModelField
} from '../types/core';
import { TriggerManager } from './manager';
import { TriggerExecutor } from '../define/executor';
import { SubscriptionClient } from '../subscribe/client';
import { ModelRecord, ConditionEvaluator } from '../utils/condition-builder';

type NotificationHandler<T> = (payload: T) => void | Promise<void>;

interface TriggerConfig<Client = any, M extends ModelName<Client> = any> {
  when?: ConditionEvaluator<Client, M> | string;
  on?: TriggerOperation | TriggerOperation[];
  timing?: TriggerTiming;
  columns?: Array<ModelField<Client, M>>;
}

export interface CustomChannelConfig<T> {
  name: string;
  schema?: T;
  functionName?: string;
}

// Legacy compatibility - keeping the old interface name
export interface ChannelConfig<T = any> {
  name: string;
  functionName?: string;
  _payloadType?: T;
}

/**
 * Centralized registry for managing multiple triggers and channels
 */
export class Registry<Client> {
  private sql: postgres.Sql;
  private executor: TriggerExecutor<Client>;
  private subscriptionClient: SubscriptionClient<Client>;

  // State management
  private modelChannels: Map<ModelName<Client>, string> = new Map();
  private customChannels: Map<string, CustomChannelConfig<any>> = new Map();
  private modelTriggers: Map<string, TriggerConfig<Client, any>> = new Map();
  private hookedTriggers: Map<TriggerManager<Client>, string> = new Map();

  // Listening state
  private handlers: Map<string, Set<NotificationHandler<any>>> = new Map();
  private isListening = false;
  private isSetup = false;

  // Current model context for fluent API
  private currentModel?: ModelName<Client>;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
    this.executor = new TriggerExecutor<Client>(sql);
    this.subscriptionClient = new SubscriptionClient<Client>(sql);
  }

  /**
   * Add basic model channels with default triggers
   */
  models<M extends ModelName<Client>>(...modelNames: M[]): this {
    modelNames.forEach((modelName) => {
      const channelName = `${String(modelName)}_events`;
      this.modelChannels.set(modelName, channelName);
    });
    return this;
  }

  /**
   * Add a custom channel with schema
   */
  custom<T = any>(
    name: string,
    schema?: T,
    config?: Partial<CustomChannelConfig<T>>
  ): this {
    this.customChannels.set(name, {
      name,
      schema,
      functionName: config?.functionName || `${name}_notify_func`,
      ...config
    });
    return this;
  }

  /**
   * Set current model context for fluent API
   */
  model<M extends ModelName<Client>>(modelName: M): ModelBuilder<Client, M> {
    this.currentModel = modelName;

    // Ensure the model has a channel
    if (!this.modelChannels.has(modelName)) {
      const channelName = `${String(modelName)}_events`;
      this.modelChannels.set(modelName, channelName);
    }

    return new ModelBuilder<Client, M>(this, modelName);
  }

  /**
   * Add a pre-configured TriggerManager instance
   */
  addTrigger(trigger: TriggerManager<Client>, channelName: string): this {
    this.hookedTriggers.set(trigger, channelName);
    return this;
  }

  /**
   * Set up all database functions and triggers
   */
  async setupDatabase(): Promise<void> {
    if (this.isSetup) return;

    // Create notification functions for model channels
    for (const [modelName, channelName] of this.modelChannels) {
      const functionName = `${channelName}_notify_func`;
      await this.executor.createNotifyFunction(functionName, channelName);
    }

    // Create notification functions for custom channels
    for (const [channelName, config] of this.customChannels) {
      await this.executor.createNotifyFunction(
        config.functionName!,
        channelName
      );
    }

    // Create model triggers
    for (const [modelName, channelName] of this.modelChannels) {
      const triggerKey = `${String(modelName)}_default`;
      const triggerConfig = this.modelTriggers.get(triggerKey) || {
        on: ['INSERT', 'UPDATE', 'DELETE'] as TriggerOperation[],
        timing: 'AFTER' as TriggerTiming
      };

      const triggerManager = new TriggerManager<Client>(this.sql);
      const definition = triggerManager
        .defineTrigger(modelName)
        .withName(`${String(modelName)}_registry_trigger`)
        .withTiming(triggerConfig.timing || 'AFTER')
        .onEvents(
          ...(Array.isArray(triggerConfig.on)
            ? triggerConfig.on
            : [triggerConfig.on || 'INSERT'])
        )
        .notifyOn(channelName);

      if (triggerConfig.when) {
        definition.withCondition(triggerConfig.when);
      }

      if (triggerConfig.columns && triggerConfig.columns.length > 0) {
        definition.watchColumns(...(triggerConfig.columns as any[]));
      }

      await definition.setupDatabase();
    }

    // Set up custom triggers defined via model().trigger()
    for (const [triggerName, triggerConfig] of this.modelTriggers) {
      if (triggerName.includes('_custom_')) {
        // This is a custom trigger, create it
        const [modelName, , triggerShortName] = triggerName.split('_');
        const channelName = `${triggerShortName}_events`;

        // Create function for this custom trigger
        const functionName = `${channelName}_notify_func`;
        await this.executor.createNotifyFunction(functionName, channelName);

        // Create the trigger
        const triggerManager = new TriggerManager<Client>(this.sql);
        const definition = triggerManager
          .defineTrigger(modelName as ModelName<Client>)
          .withName(`${modelName}_${triggerShortName}_trigger`)
          .withTiming(triggerConfig.timing || 'AFTER')
          .onEvents(
            ...(Array.isArray(triggerConfig.on)
              ? triggerConfig.on
              : [triggerConfig.on || 'INSERT'])
          )
          .notifyOn(channelName);

        if (triggerConfig.when) {
          definition.withCondition(triggerConfig.when);
        }

        if (triggerConfig.columns && triggerConfig.columns.length > 0) {
          definition.watchColumns(...(triggerConfig.columns as any[]));
        }

        await definition.setupDatabase();
      }
    }

    // Set up hooked triggers
    for (const [trigger] of this.hookedTriggers) {
      await trigger.setupDatabase();
    }

    this.isSetup = true;
  }

  /**
   * Start listening to all channels
   */
  async startListening(): Promise<void> {
    if (this.isListening) return;

    // Listen to model channels
    for (const [, channelName] of this.modelChannels) {
      await this.subscriptionClient.subscribe(channelName, {
        onNotification: (payload: any) => {
          this.handleNotification(channelName, payload);
        }
      });
    }

    // Listen to custom channels
    for (const [channelName] of this.customChannels) {
      await this.subscriptionClient.subscribe(channelName, {
        onNotification: (payload: any) => {
          this.handleNotification(channelName, payload);
        }
      });
    }

    // Listen to custom trigger channels
    for (const [triggerName] of this.modelTriggers) {
      if (triggerName.includes('_custom_')) {
        const [, , triggerShortName] = triggerName.split('_');
        const channelName = `${triggerShortName}_events`;
        await this.subscriptionClient.subscribe(channelName, {
          onNotification: (payload: any) => {
            this.handleNotification(channelName, payload);
          }
        });
      }
    }

    // Start listening for hooked triggers
    for (const [trigger] of this.hookedTriggers) {
      await trigger.startListening();
    }

    this.isListening = true;
  }

  /**
   * Stop listening to all channels
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) return;

    // Stop model channel subscriptions
    for (const [, channelName] of this.modelChannels) {
      await this.subscriptionClient.unsubscribe(channelName);
    }

    // Stop custom channel subscriptions
    for (const [channelName] of this.customChannels) {
      await this.subscriptionClient.unsubscribe(channelName);
    }

    // Stop custom trigger subscriptions
    for (const [triggerName] of this.modelTriggers) {
      if (triggerName.includes('_custom_')) {
        const [, , triggerShortName] = triggerName.split('_');
        const channelName = `${triggerShortName}_events`;
        await this.subscriptionClient.unsubscribe(channelName);
      }
    }

    // Stop hooked triggers
    for (const [trigger] of this.hookedTriggers) {
      await trigger.stopListening();
    }

    this.isListening = false;
  }

  /**
   * Convenience method for both setupDatabase and startListening
   */
  async setup(): Promise<void> {
    await this.setupDatabase();
    await this.startListening();
  }

  /**
   * Add a handler for a model channel
   */
  on<M extends ModelName<Client>>(
    modelOrChannel: M | string,
    handler: NotificationHandler<NotificationPayload<ModelRecord<Client, M>>>
  ): void {
    let channelName: string;

    // Check if it's a model name or custom channel
    if (this.modelChannels.has(modelOrChannel as M)) {
      channelName = this.modelChannels.get(modelOrChannel as M)!;
    } else if (this.customChannels.has(modelOrChannel as string)) {
      channelName = modelOrChannel as string;
    } else {
      // Check if it's a custom trigger channel
      channelName = modelOrChannel as string;
    }

    if (!this.handlers.has(channelName)) {
      this.handlers.set(channelName, new Set());
    }
    this.handlers.get(channelName)!.add(handler);
  }

  /**
   * Remove a handler for a channel
   */
  off<M extends ModelName<Client>>(
    modelOrChannel: M | string,
    handler: NotificationHandler<NotificationPayload<ModelRecord<Client, M>>>
  ): void {
    let channelName: string;

    if (this.modelChannels.has(modelOrChannel as M)) {
      channelName = this.modelChannels.get(modelOrChannel as M)!;
    } else {
      channelName = modelOrChannel as string;
    }

    const handlers = this.handlers.get(channelName);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Get registry status
   */
  getStatus() {
    return {
      isSetup: this.isSetup,
      isListening: this.isListening,
      modelChannels: Array.from(this.modelChannels.entries()),
      customChannels: Array.from(this.customChannels.keys()),
      customTriggers: Array.from(this.modelTriggers.keys()).filter((k) =>
        k.includes('_custom_')
      ),
      hookedTriggers: this.hookedTriggers.size
    };
  }

  private handleNotification(channelName: string, payload: any): void {
    const handlers = this.handlers.get(channelName);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in registry handler for ${channelName}:`, error);
        }
      });
    }
  }

  // Internal methods for ModelBuilder
  internal = {
    addModelTrigger: (key: string, config: TriggerConfig<Client, any>) => {
      this.modelTriggers.set(key, config);
    },
    getModelTrigger: (key: string) => {
      return (
        this.modelTriggers.get(key) || {
          on: ['INSERT', 'UPDATE', 'DELETE'] as TriggerOperation[],
          timing: 'AFTER' as TriggerTiming
        }
      );
    }
  };
}

/**
 * Fluent builder for model-specific configuration
 */
export class ModelBuilder<Client, M extends ModelName<Client>> {
  constructor(private registry: Registry<Client>, private modelName: M) {}

  /**
   * Add a custom trigger for this model
   */
  trigger(name: string, config: TriggerConfig<Client, M>): Registry<Client> {
    const key = `${String(this.modelName)}_custom_${name}`;
    this.registry.internal.addModelTrigger(key, config);
    return this.registry;
  }

  /**
   * Configure the default trigger for this model
   */
  onEvents(...events: TriggerOperation[]): Registry<Client> {
    const key = `${String(this.modelName)}_default`;
    const existing = this.registry.internal.getModelTrigger(key);
    this.registry.internal.addModelTrigger(key, {
      ...existing,
      on: events
    });
    return this.registry;
  }

  /**
   * Add condition to the default trigger
   */
  when(condition: ConditionEvaluator<Client, M> | string): Registry<Client> {
    const key = `${String(this.modelName)}_default`;
    const existing = this.registry.internal.getModelTrigger(key);
    this.registry.internal.addModelTrigger(key, {
      ...existing,
      when: condition
    });
    return this.registry;
  }
}
