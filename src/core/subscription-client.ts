// src/core/subscription-client.ts
import postgres from 'postgres';
import { EventEmitter } from 'events';
import { ConnectionManager } from './connection-manager';
import { SubscribeOptions } from '../types/core';

type NotificationHandler<T> = (payload: T) => void | Promise<void>;

interface ChannelSubscription {
  listenRequest: postgres.ListenRequest;
  handlers: Set<NotificationHandler<any>>;
  metrics: {
    received: number;
    processed: number;
    errors: number;
    lastReceived?: Date;
  };
}

export interface SubscriptionMetrics {
  channels: Map<
    string,
    {
      handlerCount: number;
      received: number;
      processed: number;
      errors: number;
      lastReceived?: Date;
    }
  >;
}

export class EnhancedSubscriptionClient<Client> extends EventEmitter {
  private activeChannels = new Map<string, ChannelSubscription>();
  private handlerRefs = new WeakMap<
    object,
    Map<string, NotificationHandler<any>>
  >();
  private disposed = false;

  constructor(private connectionManager: ConnectionManager) {
    super();
  }

  /**
   * Subscribe to notifications with improved error handling and metrics
   */
  public async subscribe<T>(
    channel: string,
    options: SubscribeOptions<T> & { context?: object }
  ): Promise<void> {
    if (this.disposed) {
      throw new Error('SubscriptionClient has been disposed');
    }

    const {
      onNotification,
      parser = JSON.parse,
      validator,
      onError = (error, payload) =>
        this.emit('error', { channel, error, payload }),
      context
    } = options;

    // Create handler
    const handler: NotificationHandler<T> = async (payload: any) => {
      const startTime = Date.now();
      try {
        const parsedPayload = parser(payload);
        const validPayload = validator
          ? validator(parsedPayload)
          : (parsedPayload as T);
        await onNotification(validPayload);

        this.emit('notification:processed', {
          channel,
          duration: Date.now() - startTime,
          success: true
        });
      } catch (error) {
        onError(error as Error, payload);
        this.emit('notification:processed', {
          channel,
          duration: Date.now() - startTime,
          success: false,
          error
        });
      }
    };

    // Store handler with weak reference if context provided
    if (context) {
      if (!this.handlerRefs.has(context)) {
        this.handlerRefs.set(context, new Map());
      }
      this.handlerRefs.get(context)!.set(channel, handler);
    }

    // Check if channel already exists
    const existingSubscription = this.activeChannels.get(channel);

    if (existingSubscription) {
      existingSubscription.handlers.add(handler);
      this.emit('handler:added', {
        channel,
        count: existingSubscription.handlers.size
      });
    } else {
      // Create new subscription
      const sql = this.connectionManager.getListenerConnection();
      const listenRequest = sql.listen(channel, async (payload: string) => {
        await this.handleNotification(channel, payload);
      });

      this.activeChannels.set(channel, {
        listenRequest,
        handlers: new Set([handler]),
        metrics: {
          received: 0,
          processed: 0,
          errors: 0
        }
      });

      this.emit('channel:subscribed', channel);
    }
  }

  /**
   * Process notifications concurrently with proper error isolation
   */
  private async handleNotification(
    channel: string,
    payload: string
  ): Promise<void> {
    const subscription = this.activeChannels.get(channel);
    if (!subscription) return;

    subscription.metrics.received++;
    subscription.metrics.lastReceived = new Date();

    const handlers = Array.from(subscription.handlers);
    if (handlers.length === 0) return;

    this.emit('notification:received', {
      channel,
      handlerCount: handlers.length
    });

    // Process all handlers concurrently
    const results = await Promise.allSettled(
      handlers.map((handler) =>
        Promise.resolve(handler(payload))
          .then(() => {
            subscription.metrics.processed++;
          })
          .catch((error) => {
            subscription.metrics.errors++;
            this.emit('handler:error', { channel, error, payload });
            throw error; // Re-throw for allSettled to capture
          })
      )
    );

    // Emit batch completion metrics
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.emit('notification:batch:completed', {
      channel,
      total: handlers.length,
      successful,
      failed
    });
  }

  /**
   * Unsubscribe with context support
   */
  public async unsubscribe(
    channel: string,
    handlerOrContext?: NotificationHandler<any> | object
  ): Promise<void> {
    const subscription = this.activeChannels.get(channel);
    if (!subscription) {
      this.emit('warning', `Not subscribed to channel: ${channel}`);
      return;
    }

    if (handlerOrContext) {
      if (typeof handlerOrContext === 'function') {
        // Remove specific handler
        subscription.handlers.delete(
          handlerOrContext as NotificationHandler<any>
        );
      } else {
        // Remove handler by context
        const contextHandlers = this.handlerRefs.get(handlerOrContext);
        if (contextHandlers) {
          const handler = contextHandlers.get(channel);
          if (handler) {
            subscription.handlers.delete(handler);
            contextHandlers.delete(channel);
          }
        }
      }
    } else {
      // Remove all handlers
      subscription.handlers.clear();
    }

    // If no handlers left, unlisten
    if (subscription.handlers.size === 0) {
      try {
        const meta = await subscription.listenRequest;
        await meta.unlisten();
      } catch (error) {
        this.emit('error', { channel, error, operation: 'unlisten' });
      }

      this.activeChannels.delete(channel);
      this.emit('channel:unsubscribed', channel);
    }
  }

  /**
   * Get detailed metrics for monitoring
   */
  public getMetrics(): SubscriptionMetrics {
    const metrics: SubscriptionMetrics = {
      channels: new Map()
    };

    for (const [channel, subscription] of this.activeChannels) {
      metrics.channels.set(channel, {
        handlerCount: subscription.handlers.size,
        ...subscription.metrics
      });
    }

    return metrics;
  }

  /**
   * Dispose all subscriptions
   */
  public async dispose(): Promise<void> {
    if (this.disposed) return;

    this.disposed = true;
    this.emit('disposing');

    const unsubscribePromises = Array.from(this.activeChannels.keys()).map(
      (channel) => this.unsubscribe(channel)
    );

    await Promise.allSettled(unsubscribePromises);

    this.activeChannels.clear();
    this.removeAllListeners();
    this.emit('disposed');
  }

  /**
   * Check if client is disposed
   */
  public isDisposed(): boolean {
    return this.disposed;
  }
}
