// src/notification/registry.ts
import { ModelName, NotificationPayload } from '../types/core';
import type { PgTypesafeTriggers } from '../index';
import { ModelRecord } from '../utils/condition-builder';

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export interface ChannelConfig<T = any> {
  /** The channel name */
  name: string;
  /** The function name for this channel */
  functionName?: string;
  /** Internal: Payload type reference (not used at runtime) */
  _payloadType?: T;
}

/**
 * Registry for notification channels with type safety
 */
export class NotificationRegistry<
  Client = any,
  ChannelMap extends Record<string, ChannelConfig> = {}
> {
  private channels: ChannelMap;

  constructor(initialChannels: ChannelMap = {} as ChannelMap) {
    this.channels = initialChannels;
  }

  /**
   * Register a notification channel with its payload type
   *
   * @param name - The channel name
   * @param config - Optional configuration for the channel
   * @returns The updated registry with the new channel
   */
  public channel<Name extends string, Data = any>(
    name: Name,
    config: Partial<
      Omit<ChannelConfig<NotificationPayload<Data>>, 'name' | '_payloadType'>
    > = {}
  ): NotificationRegistry<
    Client,
    Prettify<
      ChannelMap & Record<Name, ChannelConfig<NotificationPayload<Data>>>
    >
  > {
    const channelConfig: ChannelConfig<NotificationPayload<Data>> = {
      name,
      functionName: `${name}_notify_func`,
      ...config
    };

    const newChannels = {
      ...this.channels,
      [name]: channelConfig
    } as ChannelMap & Record<Name, ChannelConfig<NotificationPayload<Data>>>;

    return new NotificationRegistry<Client, typeof newChannels>(newChannels);
  }

  /**
   * Register a notification channel for a specific model
   *
   * @param name - The channel name
   * @returns The updated registry with the new channel
   */
  public defineChannel<Name extends string, M extends ModelName<Client>>(
    name: Name,
    model: M,
    config: Partial<
      Omit<
        ChannelConfig<NotificationPayload<ModelRecord<Client, M>>>,
        'name' | '_payloadType'
      >
    > = {}
  ): NotificationRegistry<
    Client,
    Prettify<
      ChannelMap &
        Record<Name, ChannelConfig<NotificationPayload<ModelRecord<Client, M>>>>
    >
  > {
    const channelConfig: ChannelConfig<
      NotificationPayload<ModelRecord<Client, M>>
    > = {
      name,
      functionName: `${name}_notify_func`,
      ...config
    };

    const newChannels = {
      ...this.channels,
      [name]: channelConfig
    } as ChannelMap &
      Record<Name, ChannelConfig<NotificationPayload<ModelRecord<Client, M>>>>;

    return new NotificationRegistry<Client, typeof newChannels>(newChannels);
  }

  /**
   * Get the channel configuration
   *
   * @param name - The channel name
   * @returns The channel configuration
   */
  public getChannel<K extends keyof ChannelMap>(
    name: K
  ): ChannelConfig<ChannelMap[K]> {
    return this.channels[name];
  }

  /**
   * Get all channel names
   *
   * @returns Array of channel names
   */
  public getChannelNames(): (keyof ChannelMap)[] {
    return Object.keys(this.channels) as (keyof ChannelMap)[];
  }

  /**
   * Creates all notification functions in the database
   *
   * @param triggers - The PgTypesafeTriggers instance
   * @returns Promise that resolves when all functions are created
   */
  public async createAllFunctions(
    triggers: PgTypesafeTriggers<any>
  ): Promise<void> {
    const channelNames = this.getChannelNames();
    for (const name of channelNames) {
      const channel = this.getChannel(name);
      await triggers.createNotifyFunction(
        channel.functionName || `${String(name)}_notify_func`,
        String(name)
      );
    }
  }

  /**
   * Get the registry as an object
   *
   * @returns The channel map
   */
  public getRegistry(): ChannelMap {
    return this.channels;
  }
}

/**
 * Builder for creating a notification client
 * with type-safe access to notification channels
 */
export class NotificationClientBuilder<
  Client,
  ChannelMap extends Record<string, ChannelConfig>
> {
  constructor(
    private triggers: PgTypesafeTriggers<Client>,
    private registry: NotificationRegistry<Client, ChannelMap>
  ) {}

  /**
   * Get a subscription handler for a specific channel
   *
   * @param channelName - The registered channel name
   * @returns A typed subscription handler
   */
  public channel<K extends keyof ChannelMap>(
    channelName: K
  ): SubscriptionHandler<Client, NonNullable<ChannelMap[K]['_payloadType']>> {
    const client = this.triggers.getSubscriptionClient();
    return new SubscriptionHandler<
      Client,
      NonNullable<ChannelMap[K]['_payloadType']>
    >(client, String(channelName));
  }

  /**
   * Get handlers for all channels
   *
   * @returns An object with handlers for all channels
   */
  public allChannels(): {
    [K in keyof ChannelMap]: SubscriptionHandler<
      Client,
      NonNullable<ChannelMap[K]['_payloadType']>
    >;
  } {
    const handlers = {} as any;
    const channelNames = this.registry.getChannelNames();

    for (const name of channelNames) {
      handlers[name] = this.channel(name);
    }

    return handlers;
  }

  /**
   * Create a unified subscription that listens to all channels
   * and allows adding handlers with .on()
   */
  public createSubscription(): MultiChannelSubscription<Client, ChannelMap> {
    return new MultiChannelSubscription<Client, ChannelMap>(
      this.triggers.getSubscriptionClient(),
      this.registry
    );
  }
}

/**
 * Handler for type-safe subscriptions to a specific channel
 */
export class SubscriptionHandler<Client, T> {
  constructor(
    private client: any, // The subscription client
    private channelName: string
  ) {}

  /**
   * Subscribe to the channel
   *
   * @param onNotification - Callback for notifications
   * @param options - Additional subscription options
   * @returns Promise that resolves when subscribed
   */
  public async subscribe(
    onNotification: (payload: NonNullable<T>) => void | Promise<void>,
    options: Omit<any, 'onNotification'> = {}
  ): Promise<void> {
    return this.client.subscribe(this.channelName, {
      onNotification,
      ...options
    });
  }

  /**
   * Unsubscribe from the channel
   *
   * @returns Promise that resolves when unsubscribed
   */
  public async unsubscribe(): Promise<void> {
    return this.client.unsubscribe(this.channelName);
  }
}

/**
 * Multiple channel subscription handler that provides an event-like interface
 */
export class MultiChannelSubscription<
  Client,
  ChannelMap extends Record<string, ChannelConfig>
> {
  private subscriptions: Map<keyof ChannelMap, boolean> = new Map();
  private handlers: Map<keyof ChannelMap, Set<Function>> = new Map();
  private isSubscribed = false;

  constructor(
    private client: any, // The subscription client
    private registry: NotificationRegistry<Client, ChannelMap>
  ) {}

  /**
   * Start listening to all channels
   */
  public async subscribe(): Promise<void> {
    if (this.isSubscribed) return;

    const channelNames = this.registry.getChannelNames();
    const subscribePromises: Promise<void>[] = [];

    for (const channelName of channelNames) {
      if (!this.handlers.has(channelName)) {
        this.handlers.set(channelName, new Set());
      }

      const subscription = this.client.subscribe(String(channelName), {
        onNotification: (payload: any) => {
          const handlers = this.handlers.get(channelName);
          if (handlers) {
            try {
              // Pass the parsed payload directly to handlers
              // Instead of reformatting it with operation: 'NOTIFY'
              handlers.forEach((handler) => handler(payload));
            } catch (error) {
              console.error(
                `Error processing notification for channel ${String(
                  channelName
                )}:`,
                error
              );
            }
          }
        }
      });

      subscribePromises.push(subscription);
      this.subscriptions.set(channelName, true);
    }

    await Promise.all(subscribePromises);
    this.isSubscribed = true;
  }

  /**
   * Add a handler for a specific channel
   */
  public on<K extends keyof ChannelMap>(
    channelName: K,
    handler: (
      payload: NonNullable<ChannelMap[K]['_payloadType']>
    ) => void | Promise<void>
  ): this {
    if (!this.handlers.has(channelName)) {
      this.handlers.set(channelName, new Set());
    }

    this.handlers.get(channelName)?.add(handler);

    // Auto-subscribe if not already subscribed
    if (this.isSubscribed && !this.subscriptions.get(channelName)) {
      this.client
        .subscribe(String(channelName), {
          onNotification: (payload: any) => {
            const handlers = this.handlers.get(channelName);
            if (handlers) {
              try {
                // Pass the parsed payload directly to handlers
                // Instead of reformatting it with operation: 'NOTIFY'
                handlers.forEach((h) => h(payload));
              } catch (error) {
                console.error(
                  `Error processing notification for channel ${String(
                    channelName
                  )}:`,
                  error
                );
              }
            }
          }
        })
        .catch(console.error);

      this.subscriptions.set(channelName, true);
    }

    return this;
  }

  /**
   * Remove a handler for a specific channel
   */
  public off<K extends keyof ChannelMap>(
    channelName: K,
    handler: (
      payload: NonNullable<ChannelMap[K]['_payloadType']>
    ) => void | Promise<void>
  ): this {
    const handlers = this.handlers.get(channelName);
    if (handlers) {
      handlers.delete(handler);
    }
    return this;
  }

  /**
   * Unsubscribe from all channels
   */
  public async unsubscribeAll(): Promise<void> {
    if (!this.isSubscribed) return;

    const unsubscribePromises: Promise<void>[] = [];

    for (const channelName of this.subscriptions.keys()) {
      if (this.subscriptions.get(channelName)) {
        unsubscribePromises.push(this.client.unsubscribe(String(channelName)));
      }
    }

    await Promise.all(unsubscribePromises);
    this.subscriptions.clear();
    this.isSubscribed = false;
  }
}

/**
 * Builder for creating trigger definitions that link to notification channels
 */
export class EnhancedTriggerBuilder<
  Client,
  M extends ModelName<Client>,
  ChannelMap extends Record<string, ChannelConfig>
> {
  constructor(
    private baseBuilder: any, // This will be the original TriggerBuilder
    private registry: NotificationRegistry<Client, ChannelMap>
  ) {}

  /**
   * Link the trigger to a notification channel
   *
   * @param channelName - The registered channel name
   * @returns The original trigger builder
   */
  public notifyOn<K extends keyof ChannelMap>(channelName: K): any {
    const channel = this.registry.getChannel(channelName);
    const functionName =
      channel.functionName || `${String(channelName)}_notify_func`;
    return this.baseBuilder.executeFunction(functionName);
  }

  // Forward common methods to the base builder
  public withName(name: string): this {
    this.baseBuilder.withName(name);
    return this;
  }

  public withTiming(timing: any): this {
    this.baseBuilder.withTiming(timing);
    return this;
  }

  public onEvents(...events: any[]): this {
    this.baseBuilder.onEvents(...events);
    return this;
  }

  public withForEach(forEach: any): this {
    this.baseBuilder.withForEach(forEach);
    return this;
  }

  public watchColumns(...columns: any[]): this {
    this.baseBuilder.watchColumns(...columns);
    return this;
  }

  public withCondition(condition: string): this {
    this.baseBuilder.withCondition(condition);
    return this;
  }

  public withTypedCondition(condition: any): this {
    this.baseBuilder.withTypedCondition(condition);
    return this;
  }

  public withConditionBuilder(): any {
    return this.baseBuilder.withConditionBuilder();
  }

  public executeFunction(name: string, ...args: string[]): any {
    return this.baseBuilder.executeFunction(name, ...args);
  }

  public async create(): Promise<void> {
    return this.baseBuilder.create();
  }
}
