// src/core/trigger-builder.ts
import { ConnectionManager } from './connection-manager';
import { BaseTrigger } from './base-trigger';
import { Condition, ConditionBuilder } from './conditions';
import {
  ModelName,
  ModelField,
  TriggerTiming,
  TriggerOperation,
  TriggerForEach,
  TriggerConfig,
  TriggerHandle
} from '../types';

// State tracking for builder pattern
interface BuilderState<Client, M extends ModelName<Client> = any> {
  model?: M;
  name?: string;
  timing?: TriggerTiming;
  events?: TriggerOperation[];
  forEach?: TriggerForEach;
  watchColumns?: Array<ModelField<Client, M>>;
  when?: string | Condition;
  functionName?: string;
  functionArgs?: string[];
  notify?: string;
}

export class TriggerBuilder<Client, M extends ModelName<Client> = any> {
  private state: BuilderState<Client, M>;
  private connectionManager: ConnectionManager;

  constructor(
    connectionManager: ConnectionManager,
    state: BuilderState<Client, M> = {}
  ) {
    this.connectionManager = connectionManager;
    this.state = state;
  }

  // Entry point - select model
  for<NewM extends ModelName<Client>>(
    model: NewM
  ): TriggerBuilder<Client, NewM> {
    return new TriggerBuilder<Client, NewM>(this.connectionManager, {
      ...this.state,
      model
    } as BuilderState<Client, NewM>);
  }

  // Optional - set trigger name
  withName(name: string): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      name
    });
  }

  // Timing methods
  before(): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      timing: 'BEFORE'
    });
  }

  after(): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      timing: 'AFTER'
    });
  }

  insteadOf(): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      timing: 'INSTEAD OF'
    });
  }

  // Events
  on(...events: TriggerOperation[]): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      events
    });
  }

  // Optional configurations
  watchColumns(
    ...columns: Array<ModelField<Client, M>>
  ): TriggerBuilder<Client, M> {
    // Only valid for UPDATE triggers
    if (!this.state.events?.includes('UPDATE')) {
      throw new Error('watchColumns can only be used with UPDATE triggers');
    }

    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      watchColumns: columns
    });
  }

  when(
    condition: string | ((c: ConditionBuilder<Client, M>) => Condition)
  ): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      when: condition
    });
  }

  forEach(value: TriggerForEach): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      forEach: value
    });
  }

  executeFunction(
    functionName: string,
    ...args: string[]
  ): TriggerBuilder<Client, M> {
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      functionName,
      functionArgs: args
    });
  }

  notify(channel?: string): TriggerBuilder<Client, M> {
    const channelName = channel || `${String(this.state.model)}_events`;
    return new TriggerBuilder(this.connectionManager, {
      ...this.state,
      notify: channelName,
      functionName: `${channelName.replace(/[^a-z0-9_]/gi, '_')}_notify_func`
    });
  }

  // Build the trigger
  build(): TriggerHandle<Client, M> {
    // Validate required fields
    if (!this.state.model) throw new Error('Model is required');
    if (!this.state.events || this.state.events.length === 0) {
      throw new Error('At least one event is required');
    }

    // Set defaults
    const config: TriggerConfig<Client, M> = {
      model: this.state.model,
      name: this.state.name,
      timing: this.state.timing || 'AFTER',
      events: this.state.events,
      forEach: this.state.forEach || 'ROW',
      functionName: this.state.functionName || this.getDefaultFunctionName(),
      functionArgs: this.state.functionArgs,
      watchColumns: this.state.watchColumns as any,
      when: this.state.when,
      notify: this.state.notify
    };

    return new BaseTrigger<Client, M>(config, this.connectionManager);
  }

  // Shorthand for build + setup + listen
  async start(): Promise<TriggerHandle<Client, M>> {
    const trigger = this.build();
    await trigger.setup();
    await trigger.listen();
    return trigger;
  }

  private getDefaultFunctionName(): string {
    const model = String(this.state.model);
    const events = this.state.events?.join('_').toLowerCase() || 'trigger';
    return `${model}_${events}_func`;
  }
}

// Factory function for object-based configuration
export function createTriggerFromConfig<Client, M extends ModelName<Client>>(
  config: TriggerConfig<Client, M>,
  connectionManager: ConnectionManager
): TriggerHandle<Client, M> {
  return new BaseTrigger(config, connectionManager);
}
