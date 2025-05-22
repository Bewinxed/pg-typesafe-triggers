// src/subscribe/client.ts (fixed with multiple handlers per channel)
import postgres from 'postgres';
import { SubscribeOptions } from '../types/core';

type NotificationHandler<T> = (payload: T) => void | Promise<void>;

interface ChannelSubscription {
  listenRequest: postgres.ListenRequest;
  handlers: Set<NotificationHandler<any>>;
}

/**
 * Client for subscribing to PostgreSQL notifications
 */
class SubscriptionClient<Client> {
  private sql: postgres.Sql;
  private activeChannels: Map<string, ChannelSubscription> = new Map();

  /**
   * Creates a new SubscriptionClient instance
   *
   * @param sql - A postgres.js client instance
   */
  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  /**
   * Subscribes to notifications on a specific channel
   *
   * @template T - The expected shape of the notification payload
   * @param channel - The notification channel to listen to
   * @param options - Options for handling notifications
   * @returns A promise that resolves when the subscription is active
   */
  public async subscribe<T>(
    channel: string,
    options: SubscribeOptions<T>
  ): Promise<void> {
    const {
      onNotification,
      parser = JSON.parse,
      validator,
      onError = (error) => console.error('Subscription error:', error)
    } = options;

    // Create a typed handler function
    const handler: NotificationHandler<T> = async (payload: any) => {
      try {
        // Parse the payload
        const parsedPayload = parser(payload);

        // Validate if a validator is provided
        const validPayload = validator
          ? validator(parsedPayload)
          : (parsedPayload as T);

        // Call the notification handler
        await onNotification(validPayload);
      } catch (error) {
        onError(error as Error, payload);
      }
    };

    // Check if channel already has a postgres LISTEN
    const existingSubscription = this.activeChannels.get(channel);

    if (existingSubscription) {
      // Channel already exists - just add this handler
      existingSubscription.handlers.add(handler);
    } else {
      // New channel - create postgres LISTEN and handler set
      const listenRequest = this.sql.listen(
        channel,
        async (payload: string) => {
          // Get current handlers for this channel
          const subscription = this.activeChannels.get(channel);
          if (subscription) {
            // Call all handlers for this channel
            const handlerPromises = Array.from(subscription.handlers).map((h) =>
              Promise.resolve(h(payload)).catch((error) =>
                onError(error as Error, payload)
              )
            );
            await Promise.allSettled(handlerPromises);
          }
        }
      );

      // Store the channel subscription
      this.activeChannels.set(channel, {
        listenRequest,
        handlers: new Set([handler])
      });
    }
  }

  /**
   * Unsubscribes a specific handler from notifications on a channel
   *
   * @param channel - The notification channel to unsubscribe from
   * @param handler - The specific handler to remove (optional - removes all if not provided)
   * @returns A promise that resolves when unsubscribed
   */
  public async unsubscribe(
    channel: string,
    handler?: NotificationHandler<any>
  ): Promise<void> {
    const subscription = this.activeChannels.get(channel);

    if (!subscription) {
      console.warn(`Not subscribed to channel: ${channel}`);
      return;
    }

    if (handler) {
      // Remove specific handler
      subscription.handlers.delete(handler);
    } else {
      // Remove all handlers for this channel
      subscription.handlers.clear();
    }

    // If no handlers left, unlisten from postgres
    if (subscription.handlers.size === 0) {
      try {
        const meta = await subscription.listenRequest;
        await meta.unlisten();
      } catch (error) {
        console.warn(`Error unlistening from ${channel}:`, error);
      }

      // Remove channel completely
      this.activeChannels.delete(channel);
    }
  }

  /**
   * Unsubscribes from all active subscriptions
   *
   * @returns A promise that resolves when all unsubscriptions are complete
   */
  public async unsubscribeAll(): Promise<void> {
    const unsubscribePromises = Array.from(this.activeChannels.keys()).map(
      async (channel) => {
        await this.unsubscribe(channel);
      }
    );

    await Promise.all(unsubscribePromises);
  }

  /**
   * Get debug info about active subscriptions
   */
  public getActiveChannels(): string[] {
    return Array.from(this.activeChannels.keys());
  }

  /**
   * Get handler count for a specific channel
   */
  public getHandlerCount(channel: string): number {
    const subscription = this.activeChannels.get(channel);
    return subscription ? subscription.handlers.size : 0;
  }
}

// Export the class
export { SubscriptionClient };
