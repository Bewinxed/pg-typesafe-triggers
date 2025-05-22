// src/core/typesafe-builder.ts
import {
  ModelName,
  TriggerTiming,
  TriggerOperation,
  TriggerForEach,
  ModelField
} from '../types/core';

// Branded types for builder stages with proper model type constraints
type Uninitialized = { readonly _brand: 'uninitialized' };
type WithModel<M extends string = string> = {
  readonly _brand: 'withModel';
  readonly _modelType: M;
};
type WithName<M extends string = string> = {
  readonly _brand: 'withName';
  readonly _modelType: M;
};
type WithTiming<M extends string = string> = {
  readonly _brand: 'withTiming';
  readonly _modelType: M;
};
type WithEvents<M extends string = string> = {
  readonly _brand: 'withEvents';
  readonly _modelType: M;
};
type Complete<M extends string = string> = {
  readonly _brand: 'complete';
  readonly _modelType: M;
};

// Simplified BuilderState type
type BuilderState = {
  _brand?:
    | 'uninitialized'
    | 'withModel'
    | 'withName'
    | 'withTiming'
    | 'withEvents'
    | 'complete';
  _model?: string;
  _name?: string;
  _timing?: TriggerTiming;
  _events?: TriggerOperation[];
  _condition?: string;
  _columns?: string[];
  _forEach?: TriggerForEach;
  _function?: string;
  _args?: string[];
};

// Helper to validate method calls and return appropriate error types
type ValidateMethodCall<State, Method extends string> = Method extends 'for'
  ? State extends Uninitialized
    ? true
    : `⛔ You must call "for" first to specify which table this trigger is for. Example: builder.for("users")`
  : Method extends 'withName'
  ? State extends WithModel<any>
    ? true
    : `⛔ You must call "for" first to specify which table this trigger is for. Example: builder.for("users")`
  : Method extends 'before' | 'after' | 'insteadOf'
  ? State extends WithName<any>
    ? true
    : `⛔ You must call "withName" first to give your trigger a unique name. Example: builder.withName("user_audit_trigger")`
  : Method extends 'on'
  ? State extends WithTiming<any>
    ? true
    : `⛔ You must set trigger timing first using "before", "after", or "insteadOf". Example: builder.after()`
  : Method extends 'when' | 'watchColumns' | 'forEach' | 'execute' | 'notify'
  ? State extends WithEvents<any>
    ? true
    : `⛔ You must specify trigger events first using "on". Example: builder.on("INSERT", "UPDATE")`
  : Method extends 'build'
  ? State extends Complete<any> | WithEvents<any>
    ? true
    : `⛔ You must specify trigger events first using "on". Example: builder.on("INSERT", "UPDATE")`
  : never;

// Extract model type from state with proper fallback
type ExtractModelType<State> = State extends {
  _modelType: infer M extends string;
}
  ? M
  : string; // fallback to string instead of unknown

// Type-safe builder that enforces method calling order with helpful errors
export class TypeSafeTriggerBuilder<Client, State = Uninitialized> {
  private state: BuilderState;

  constructor(state: BuilderState = {}) {
    this.state = state;
    if (!this.state._brand) {
      this.state._brand = 'uninitialized';
    }
  }

  for<M extends ModelName<Client>>(
    model: ValidateMethodCall<State, 'for'> extends true
      ? M
      : ValidateMethodCall<State, 'for'>
  ): ValidateMethodCall<State, 'for'> extends true
    ? TypeSafeTriggerBuilder<Client, WithModel<M>>
    : ValidateMethodCall<State, 'for'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _model: model as string,
      _brand: 'withModel'
    }) as any;
  }

  withName(
    name: ValidateMethodCall<State, 'withName'> extends true
      ? string
      : ValidateMethodCall<State, 'withName'>
  ): ValidateMethodCall<State, 'withName'> extends true
    ? TypeSafeTriggerBuilder<Client, WithName<ExtractModelType<State> & string>>
    : ValidateMethodCall<State, 'withName'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _name: name as string,
      _brand: 'withName'
    }) as any;
  }

  before(): ValidateMethodCall<State, 'before'> extends true
    ? TypeSafeTriggerBuilder<
        Client,
        WithTiming<ExtractModelType<State> & string>
      >
    : ValidateMethodCall<State, 'before'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _timing: 'BEFORE',
      _brand: 'withTiming'
    }) as any;
  }

  after(): ValidateMethodCall<State, 'after'> extends true
    ? TypeSafeTriggerBuilder<
        Client,
        WithTiming<ExtractModelType<State> & string>
      >
    : ValidateMethodCall<State, 'after'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _timing: 'AFTER',
      _brand: 'withTiming'
    }) as any;
  }

  insteadOf(): ValidateMethodCall<State, 'insteadOf'> extends true
    ? TypeSafeTriggerBuilder<
        Client,
        WithTiming<ExtractModelType<State> & string>
      >
    : ValidateMethodCall<State, 'insteadOf'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _timing: 'INSTEAD OF',
      _brand: 'withTiming'
    }) as any;
  }

  on(
    ...events: ValidateMethodCall<State, 'on'> extends true
      ? TriggerOperation[]
      : [ValidateMethodCall<State, 'on'>]
  ): ValidateMethodCall<State, 'on'> extends true
    ? TypeSafeTriggerBuilder<
        Client,
        WithEvents<ExtractModelType<State> & string>
      >
    : ValidateMethodCall<State, 'on'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _events: events as TriggerOperation[],
      _brand: 'withEvents'
    }) as any;
  }

  when<M extends string = ExtractModelType<State> & string>(
    condition: ValidateMethodCall<State, 'when'> extends true
      ? (records: {
          NEW: ModelRecord<Client, M>;
          OLD: ModelRecord<Client, M>;
        }) => boolean
      : ValidateMethodCall<State, 'when'>
  ): ValidateMethodCall<State, 'when'> extends true
    ? TypeSafeTriggerBuilder<
        Client,
        WithEvents<ExtractModelType<State> & string>
      >
    : ValidateMethodCall<State, 'when'> {
    const sql = buildConditionSQL(condition as Function);
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _condition: sql,
      _brand: 'withEvents'
    }) as any;
  }

  watchColumns<
    M extends ModelName<Client> = ExtractModelType<State> & ModelName<Client>
  >(
    ...columns: ValidateMethodCall<State, 'watchColumns'> extends true
      ? Array<ModelField<Client, M>>
      : [ValidateMethodCall<State, 'watchColumns'>]
  ): ValidateMethodCall<State, 'watchColumns'> extends true
    ? TypeSafeTriggerBuilder<
        Client,
        WithEvents<ExtractModelType<State> & string>
      >
    : ValidateMethodCall<State, 'watchColumns'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _columns: columns as string[],
      _brand: 'withEvents'
    }) as any;
  }

  forEach(
    value: ValidateMethodCall<State, 'forEach'> extends true
      ? TriggerForEach
      : ValidateMethodCall<State, 'forEach'>
  ): ValidateMethodCall<State, 'forEach'> extends true
    ? TypeSafeTriggerBuilder<
        Client,
        WithEvents<ExtractModelType<State> & string>
      >
    : ValidateMethodCall<State, 'forEach'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _forEach: value as TriggerForEach,
      _brand: 'withEvents'
    }) as any;
  }

  execute(
    functionName: ValidateMethodCall<State, 'execute'> extends true
      ? string
      : ValidateMethodCall<State, 'execute'>,
    ...args: ValidateMethodCall<State, 'execute'> extends true
      ? string[]
      : [ValidateMethodCall<State, 'execute'>]
  ): ValidateMethodCall<State, 'execute'> extends true
    ? TypeSafeTriggerBuilder<Client, Complete<ExtractModelType<State> & string>>
    : ValidateMethodCall<State, 'execute'> {
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _function: functionName as string,
      _args: args as string[],
      _brand: 'complete'
    }) as any;
  }

  notify(
    channel?: ValidateMethodCall<State, 'notify'> extends true
      ? string
      : ValidateMethodCall<State, 'notify'>
  ): ValidateMethodCall<State, 'notify'> extends true
    ? TypeSafeTriggerBuilder<Client, Complete<ExtractModelType<State> & string>>
    : ValidateMethodCall<State, 'notify'> {
    const channelName = (channel as string) || `${this.state._model}_events`;
    return new TypeSafeTriggerBuilder({
      ...this.state,
      _function: `${channelName}_notify_func`,
      _args: [],
      _brand: 'complete'
    }) as any;
  }

  async build(): Promise<
    ValidateMethodCall<State, 'build'> extends true
      ? TriggerHandle
      : ValidateMethodCall<State, 'build'>
  > {
    const config = {
      model: this.state._model!,
      name: this.state._name!,
      timing: this.state._timing!,
      events: this.state._events!,
      condition: this.state._condition,
      columns: this.state._columns,
      forEach: this.state._forEach || 'ROW',
      function: this.state._function || 'default_notify_func',
      args: this.state._args || []
    };

    return (await createTrigger(config)) as any;
  }
}

// Improved ModelRecord type that should extract all fields
type ModelRecord<Client, M extends string> = M extends keyof Client
  ? Client[M] extends {
      findFirst: (...args: any[]) => Promise<infer Result>;
    }
    ? NonNullable<Result>
    : Client[M] extends {
        findUnique: (...args: any[]) => Promise<infer Result>;
      }
    ? NonNullable<Result>
    : never
  : never;

// Placeholder implementations
declare function buildConditionSQL(condition: Function): string;
declare function createTrigger(config: any): Promise<TriggerHandle>;

interface TriggerHandle {
  drop(): Promise<void>;
  getStatus(): TriggerStatus;
}

interface TriggerStatus {
  name: string;
  table: string;
  active: boolean;
}
