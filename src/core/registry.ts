// src/core/registry.ts
import { ConnectionManager } from './connection-manager';
import { BaseTrigger } from './base-trigger';
import {
  Registry,
  RegistryStatus,
  TriggerHandle,
  TriggerConfig,
  TriggerDefinition,
  TriggerEvent,
  ModelName,
  TriggerOperation
} from '../types';

export class TriggerRegistry<Client, TriggerMap = {}>
  implements Registry<Client, TriggerMap>
{
  private triggers = new Map<string, TriggerHandle<Client, any>>();
  private connectionManager: ConnectionManager;
  private modelToTriggerMap = new Map<string, Set<string>>();
  private triggerIdToModel = new Map<string, string>();
  private handlers = new Map<
    string,
    Set<(event: any) => void | Promise<void>>
  >();

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  // Original add method - still works with models
  add<M extends ModelName<Client>>(
    modelOrTrigger: M | TriggerHandle<Client, any>,
    config?: Omit<TriggerConfig<Client, M>, 'model'>
  ): Registry<Client, TriggerMap> {
    if (typeof modelOrTrigger === 'string') {
      if (!config) {
        throw new Error('Config is required when adding by model name');
      }

      const fullConfig: TriggerConfig<Client, M> = {
        ...config,
        model: modelOrTrigger
      } as TriggerConfig<Client, M>;

      const trigger = new BaseTrigger(fullConfig, this.connectionManager);
      const triggerId = this.generateTriggerId(modelOrTrigger, config);
      this.addTrigger(triggerId, trigger);
    } else {
      // Generate ID from trigger config
      const trigger = modelOrTrigger;
      const model = String(trigger.config.model);
      const triggerId = this.generateTriggerId(model, trigger.config);
      this.addTrigger(triggerId, trigger);
    }

    return this;
  }

  // New define method - returns Registry with updated type
  define<ID extends string, M extends ModelName<Client>>(
    id: ID,
    definition: TriggerDefinition<Client, M>
  ): Registry<
    Client,
    TriggerMap & { [K in ID]: TriggerEvent<Client, M, TriggerOperation> }
  > {
    const fullConfig: TriggerConfig<Client, M> = {
      ...definition,
      name: definition.name || `${id}_trigger`,
      functionName: definition.functionName || `${id}_func`,
      functionArgs: definition.functionArgs || [],
      forEach: definition.forEach || 'ROW'
    } as TriggerConfig<Client, M>;

    const trigger = new BaseTrigger(fullConfig, this.connectionManager);
    this.addTrigger(id, trigger);

    // Map the ID to the model for onModel functionality
    this.triggerIdToModel.set(id, String(definition.model));

    // Return this with updated type
    return this as any;
  }

  private generateTriggerId(model: string, config: any): string {
    if (config.name) {
      return `${model}_${config.name}`;
    }
    const events = config.events?.join('_').toLowerCase() || 'trigger';
    return `${model}_${events}`;
  }

  private addTrigger(
    triggerId: string,
    trigger: TriggerHandle<Client, any>
  ): void {
    const model = String(trigger.config.model);

    this.triggers.set(triggerId, trigger);

    // Track model to trigger mapping
    if (!this.modelToTriggerMap.has(model)) {
      this.modelToTriggerMap.set(model, new Set());
    }
    this.modelToTriggerMap.get(model)!.add(triggerId);

    // Track trigger ID to model mapping
    this.triggerIdToModel.set(triggerId, model);

    // Attach to registry
    trigger.attachToRegistry(this as any);
  }

  async setup(): Promise<void> {
    // Setup all triggers
    const setupPromises = Array.from(this.triggers.values()).map((trigger) =>
      trigger.setup()
    );

    await Promise.all(setupPromises);
  }

  async listen(): Promise<void> {
    // Start listening on all triggers
    const listenPromises = Array.from(this.triggers.values()).map((trigger) =>
      trigger.listen()
    );

    await Promise.all(listenPromises);
  }

  async stop(): Promise<void> {
    // Stop all triggers
    const stopPromises = Array.from(this.triggers.values()).map((trigger) =>
      trigger.stop()
    );

    await Promise.all(stopPromises);
  }

  async drop(): Promise<void> {
    // Drop all triggers
    const dropPromises = Array.from(this.triggers.values()).map((trigger) =>
      trigger.drop()
    );

    await Promise.all(dropPromises);

    // Clear internal state
    this.triggers.clear();
    this.modelToTriggerMap.clear();
    this.triggerIdToModel.clear();
    this.handlers.clear();
  }

  // Type-safe on method with overloads
  on<K extends keyof TriggerMap>(
    triggerId: K,
    handler: (event: TriggerMap[K]) => void | Promise<void>
  ): () => void;
  on<M extends ModelName<Client>>(
    model: M,
    handler: (
      event: TriggerEvent<Client, M, TriggerOperation>
    ) => void | Promise<void>
  ): () => void;
  on(
    idOrModel: string,
    handler: (event: any) => void | Promise<void>
  ): () => void {
    // Check if it's a trigger ID first
    const trigger = this.triggers.get(idOrModel);

    if (trigger) {
      // It's a specific trigger ID
      const unsubscribe = trigger.subscribe(handler);

      // Track handler
      if (!this.handlers.has(idOrModel)) {
        this.handlers.set(idOrModel, new Set());
      }
      this.handlers.get(idOrModel)!.add(handler);

      return () => {
        unsubscribe();
        const idHandlers = this.handlers.get(idOrModel);
        if (idHandlers) {
          idHandlers.delete(handler);
        }
      };
    }

    // Otherwise, treat it as a model name
    return this.onModel(idOrModel as any, handler);
  }

  // Listen to all triggers for a model
  onModel<M extends ModelName<Client>>(
    model: M,
    handler: (
      event: TriggerEvent<Client, M, TriggerOperation>
    ) => void | Promise<void>
  ): () => void {
    const modelStr = String(model);

    // Get all triggers for this model
    const triggerIds = this.modelToTriggerMap.get(modelStr);
    if (!triggerIds) {
      throw new Error(`No triggers registered for model: ${modelStr}`);
    }

    // Subscribe to all triggers for this model
    const unsubscribes: Array<() => void> = [];

    for (const triggerId of triggerIds) {
      const trigger = this.triggers.get(triggerId);
      if (trigger) {
        const unsubscribe = trigger.subscribe(handler as any);
        unsubscribes.push(unsubscribe);
      }
    }

    // Track handler
    if (!this.handlers.has(modelStr)) {
      this.handlers.set(modelStr, new Set());
    }
    this.handlers.get(modelStr)!.add(handler as any);

    // Return combined unsubscribe
    return () => {
      unsubscribes.forEach((unsub) => unsub());
      const modelHandlers = this.handlers.get(modelStr);
      if (modelHandlers) {
        modelHandlers.delete(handler as any);
      }
    };
  }

  // Get all registered trigger IDs
  getTriggerIds(): string[] {
    return Array.from(this.triggers.keys());
  }

  getStatus(): RegistryStatus {
    const triggers = new Map();

    for (const [key, trigger] of this.triggers) {
      triggers.set(key, trigger.getStatus());
    }

    // Check if all are setup and listening
    const allStatuses = Array.from(this.triggers.values()).map((t) =>
      t.getStatus()
    );
    const isSetup =
      allStatuses.length > 0 && allStatuses.every((s) => s.isSetup);
    const isListening =
      allStatuses.length > 0 && allStatuses.every((s) => s.isListening);

    return {
      triggers,
      isSetup,
      isListening
    };
  }
}
