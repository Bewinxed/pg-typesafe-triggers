// src/subscribe/client.ts (modified)
import postgres from 'postgres';
import { SubscribeOptions } from '../types/core';

/**
 * Client for subscribing to PostgreSQL notifications
 */
class SubscriptionClient<Client> {
  private sql: postgres.Sql;
  private activeSubscriptions: Map<string, postgres.ListenRequest> = new Map();

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

    // Check if already subscribed
    if (this.activeSubscriptions.has(channel)) {
      throw new Error(`Already subscribed to channel: ${channel}`);
    }

    // Create the subscription
    const listenRequest = this.sql.listen(channel, async (payload) => {
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
    });

    // Store the subscription
    this.activeSubscriptions.set(channel, listenRequest);
  }

  /**
   * Unsubscribes from notifications on a specific channel
   *
   * @param channel - The notification channel to unsubscribe from
   * @returns A promise that resolves when unsubscribed
   */
  public async unsubscribe(channel: string): Promise<void> {
    const listenRequest = this.activeSubscriptions.get(channel);

    if (!listenRequest) {
      throw new Error(`Not subscribed to channel: ${channel}`);
    }

    // Unlisten
    const meta = await listenRequest;
    await meta.unlisten();

    // Remove from active subscriptions
    this.activeSubscriptions.delete(channel);
  }

  /**
   * Unsubscribes from all active subscriptions
   *
   * @returns A promise that resolves when all unsubscriptions are complete
   */
  public async unsubscribeAll(): Promise<void> {
    const unsubscribePromises = Array.from(this.activeSubscriptions.keys()).map(
      async (channel) => {
        await this.unsubscribe(channel);
      }
    );

    await Promise.all(unsubscribePromises);
  }
}

// Export the class
export { SubscriptionClient };
