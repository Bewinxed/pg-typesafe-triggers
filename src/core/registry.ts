// src/core/registry.ts
import { ConnectionManager } from './connection-manager';
import { BaseTrigger } from './base-trigger';
import {
  Registry,
  RegistryStatus,
  TriggerHandle,
  TriggerConfig,
  TriggerEvent,
  ModelName,
  TriggerOperation
} from '../types';

export class TriggerRegistry<Client> implements Registry<Client> {
  private triggers = new Map<string, TriggerHandle<Client, any>>();
  private connectionManager: ConnectionManager;
  private modelToTriggerMap = new Map<string, Set<string>>();
  private handlers = new Map<
    string,
    Set<(event: any) => void | Promise<void>>
  >();

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  // src/core/registry.ts
  add<M extends ModelName<Client>>(
    modelOrTrigger: M | TriggerHandle<Client, any>,
    config?: Omit<TriggerConfig<Client, M>, 'model'> // <-- Require all props except model
  ): this {
    if (typeof modelOrTrigger === 'string') {
      if (!config) {
        throw new Error('Config is required when adding by model name');
      }

      const fullConfig: TriggerConfig<Client, M> = {
        ...config,
        model: modelOrTrigger
      } as TriggerConfig<Client, M>;

      const trigger = new BaseTrigger(fullConfig, this.connectionManager);
      this.addTrigger(trigger);
    } else {
      this.addTrigger(modelOrTrigger);
    }

    return this;
  }

  private addTrigger(trigger: TriggerHandle<Client, any>): void {
    const model = String(trigger.config.model);
    const triggerKey = `${model}_${trigger.config.name}`;

    this.triggers.set(triggerKey, trigger);

    // Track model to trigger mapping
    if (!this.modelToTriggerMap.has(model)) {
      this.modelToTriggerMap.set(model, new Set());
    }
    this.modelToTriggerMap.get(model)!.add(triggerKey);

    // Attach to registry
    trigger.attachToRegistry(this);
  }

  private generateFunctionName(
    model: string,
    events: TriggerOperation[]
  ): string {
    const eventStr = events.join('_').toLowerCase();
    return `${model}_${eventStr}_registry_func`;
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
    this.handlers.clear();
  }

  on<M extends ModelName<Client>>(
    model: M,
    handler: (
      event: TriggerEvent<Client, M, TriggerOperation>
    ) => void | Promise<void>
  ): () => void {
    const modelStr = String(model);

    // Get all triggers for this model
    const triggerKeys = this.modelToTriggerMap.get(modelStr);
    if (!triggerKeys) {
      throw new Error(`No triggers registered for model: ${modelStr}`);
    }

    // Subscribe to all triggers for this model
    const unsubscribes: Array<() => void> = [];

    for (const triggerKey of triggerKeys) {
      const trigger = this.triggers.get(triggerKey);
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

  // Builder pattern support
  define<M extends ModelName<Client>>(
    model: M,
    events?: TriggerOperation[]
  ): RegistryBuilder<Client, M> {
    return new RegistryBuilder(this, model, events);
  }
}

// Helper class for fluent registry building
class RegistryBuilder<Client, M extends ModelName<Client>> {
  constructor(
    private registry: TriggerRegistry<Client>,
    private model: M,
    private events?: TriggerOperation[]
  ) {}

  withTiming(timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF'): this {
    // Store config for later
    (this as any)._timing = timing;
    return this;
  }

  forEach(value: 'ROW' | 'STATEMENT'): this {
    (this as any)._forEach = value;
    return this;
  }

  when(condition: string | ((records: any) => boolean)): this {
    (this as any)._when = condition;
    return this;
  }

  notify(channel: string): this {
    (this as any)._notify = channel;
    return this;
  }

  done(): TriggerRegistry<Client> {
    const config: Partial<TriggerConfig<Client, M>> = {
      timing: (this as any)._timing || 'AFTER',
      events: this.events || ['INSERT', 'UPDATE', 'DELETE'],
      forEach: (this as any)._forEach || 'ROW',
      when: (this as any)._when,
      notify: (this as any)._notify
    };

    this.registry.add(this.model, config as any);
    return this.registry;
  }
}
