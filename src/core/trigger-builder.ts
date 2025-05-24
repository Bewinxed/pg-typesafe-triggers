// src/core/trigger-builder.ts
import { ConnectionManager } from './connection-manager';
import { BaseTrigger } from './base-trigger';
import { Condition, ConditionBuilder } from './conditions';
import {
  buildWhereCondition,
  ConditionEvaluator
} from '../utils/condition-parser';
import {
  ModelName,
  ModelField,
  TriggerTiming,
  TriggerOperation,
  TriggerForEach,
  TriggerConfig,
  TriggerHandle
} from '../types';

// State types
export type EmptyState = { readonly _brand: 'empty' };
export type WithModelState<M> = {
  readonly _brand: 'withModel';
  readonly _model: M;
};
export type WithNameState<M> = {
  readonly _brand: 'withName';
  readonly _model: M;
};
export type WithTimingState<M> = {
  readonly _brand: 'withTiming';
  readonly _model: M;
};
export type WithEventsState<M> = {
  readonly _brand: 'withEvents';
  readonly _model: M;
};
export type CompleteState<M> = {
  readonly _brand: 'complete';
  readonly _model: M;
};

// State tracking for builder pattern
interface BuilderState<Client, M extends ModelName<Client> = any> {
  model?: M;
  name?: string;
  timing?: TriggerTiming;
  events?: TriggerOperation[];
  forEach?: TriggerForEach;
  watchColumns?: Array<ModelField<Client, M>>;
  when?: string | ((c: ConditionBuilder<Client, M>) => Condition);
  functionName?: string;
  functionArgs?: string[];
  notify?: string;
}

// Base builder without any methods
class TriggerBuilderBase<Client, State> {
  protected state: BuilderState<Client, any>;
  protected connectionManager: ConnectionManager;

  constructor(
    connectionManager: ConnectionManager,
    state: BuilderState<Client, any> = {}
  ) {
    this.connectionManager = connectionManager;
    this.state = state;
  }

  protected getDefaultFunctionName(): string {
    const model = String(this.state.model);
    const events = this.state.events?.join('_').toLowerCase() || 'trigger';
    return `${model}_${events}_func`;
  }
}

// Interfaces for each state with only the methods that should be available
interface EmptyBuilder<Client> {
  for<M extends ModelName<Client>>(
    model: M
  ): TriggerBuilder<Client, WithModelState<M>>;
}

interface WithModelBuilder<Client, M> {
  withName(name: string): TriggerBuilder<Client, WithNameState<M>>;
}

interface WithNameBuilder<Client, M> {
  before(): TriggerBuilder<Client, WithTimingState<M>>;
  after(): TriggerBuilder<Client, WithTimingState<M>>;
  insteadOf(): TriggerBuilder<Client, WithTimingState<M>>;
}

interface WithTimingBuilder<Client, M> {
  on(...events: TriggerOperation[]): TriggerBuilder<Client, WithEventsState<M>>;
}

interface WithEventsBuilder<Client, M extends ModelName<Client>> {
  watchColumns(
    ...columns: Array<ModelField<Client, M>>
  ): TriggerBuilder<Client, WithEventsState<M>>;
  when(
    condition:
      | string
      | ConditionEvaluator<Client, M>
      | ((c: ConditionBuilder<Client, M>) => Condition)
  ): TriggerBuilder<Client, WithEventsState<M>>;
  forEach(value: TriggerForEach): TriggerBuilder<Client, WithEventsState<M>>;
  executeFunction(
    functionName: string,
    ...args: string[]
  ): TriggerBuilder<Client, CompleteState<M>>;
  notify(channel?: string): TriggerBuilder<Client, CompleteState<M>>;
  build(): TriggerHandle<Client, M>;
}

interface CompleteBuilder<Client, M extends ModelName<Client>> {
  build(): TriggerHandle<Client, M>;
}

// Type that combines base with appropriate interface based on state
export type TriggerBuilder<Client, State> = State extends EmptyState
  ? TriggerBuilderBase<Client, State> & EmptyBuilder<Client>
  : State extends WithModelState<infer M>
  ? TriggerBuilderBase<Client, State> & WithModelBuilder<Client, M>
  : State extends WithNameState<infer M>
  ? TriggerBuilderBase<Client, State> & WithNameBuilder<Client, M>
  : State extends WithTimingState<infer M>
  ? TriggerBuilderBase<Client, State> & WithTimingBuilder<Client, M>
  : State extends WithEventsState<infer M>
  ? M extends ModelName<Client>
    ? TriggerBuilderBase<Client, State> & WithEventsBuilder<Client, M>
    : never
  : State extends CompleteState<infer M>
  ? M extends ModelName<Client>
    ? TriggerBuilderBase<Client, State> & CompleteBuilder<Client, M>
    : never
  : never;

// Implementation class
class TriggerBuilderImpl<Client, State> extends TriggerBuilderBase<
  Client,
  State
> {
  for<M extends ModelName<Client>>(
    model: M
  ): TriggerBuilder<Client, WithModelState<M>> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      model
    }) as any;
  }

  withName(name: string): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      name
    }) as any;
  }

  before(): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      timing: 'BEFORE'
    }) as any;
  }

  after(): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      timing: 'AFTER'
    }) as any;
  }

  insteadOf(): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      timing: 'INSTEAD OF'
    }) as any;
  }

  on(...events: TriggerOperation[]): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      events
    }) as any;
  }

  watchColumns(...columns: any[]): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      watchColumns: columns
    }) as any;
  }

  when(condition: any): TriggerBuilder<Client, any> {
    let whenCondition: string | ((c: ConditionBuilder<any, any>) => Condition);

    if (typeof condition === 'string') {
      whenCondition = condition;
    } else {
      const funcStr = condition.toString();
      const isConditionBuilder = funcStr.match(
        /^\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)\s*=>/
      );

      if (isConditionBuilder) {
        whenCondition = condition as (
          c: ConditionBuilder<any, any>
        ) => Condition;
      } else {
        whenCondition = buildWhereCondition(
          condition as ConditionEvaluator<any, any>
        );
      }
    }

    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      when: whenCondition
    }) as any;
  }

  forEach(value: TriggerForEach): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      forEach: value
    }) as any;
  }

  executeFunction(
    functionName: string,
    ...args: string[]
  ): TriggerBuilder<Client, any> {
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      functionName,
      functionArgs: args
    }) as any;
  }

  notify(channel?: string): TriggerBuilder<Client, any> {
    const channelName = channel || `${String(this.state.model)}_events`;
    return new TriggerBuilderImpl(this.connectionManager, {
      ...this.state,
      notify: channelName,
      functionName: `${channelName.replace(/[^a-z0-9_]/gi, '_')}_notify_func`
    }) as any;
  }

  build(): TriggerHandle<Client, any> {
    const config: TriggerConfig<Client, any> = {
      model: this.state.model!,
      name: this.state.name,
      timing: this.state.timing!,
      events: this.state.events!,
      forEach: this.state.forEach || 'ROW',
      functionName: this.state.functionName || this.getDefaultFunctionName(),
      functionArgs: this.state.functionArgs,
      watchColumns: this.state.watchColumns,
      when: this.state.when,
      notify: this.state.notify
    };

    return new BaseTrigger(config, this.connectionManager);
  }
}

// Factory function to create initial builder
export function createTriggerBuilder<Client>(
  connectionManager: ConnectionManager
): TriggerBuilder<Client, EmptyState> {
  return new TriggerBuilderImpl(connectionManager, {}) as any;
}

// Factory function for config-based creation
export function createTriggerFromConfig<Client, M extends ModelName<Client>>(
  config: TriggerConfig<Client, M>,
  connectionManager: ConnectionManager
): TriggerHandle<Client, M> {
  return new BaseTrigger(config, connectionManager);
}
