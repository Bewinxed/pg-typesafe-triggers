"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionClient = void 0;
/**
 * Client for subscribing to PostgreSQL notifications
 */
class SubscriptionClient {
    /**
     * Creates a new SubscriptionClient instance
     *
     * @param sql - A postgres.js client instance
     */
    constructor(sql) {
        this.activeSubscriptions = new Map();
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
    async subscribe(channel, options) {
        const { onNotification, parser = JSON.parse, validator, onError = (error) => console.error('Subscription error:', error) } = options;
        // Check if already subscribed
        if (this.activeSubscriptions.has(channel)) {
            throw new Error(`Already subscribed to channel: ${channel}`);
        }
        // Create the subscription
        const subscription = this.sql.listen(channel, async (payload) => {
            try {
                // Parse the payload
                const parsedPayload = parser(payload);
                // Validate if a validator is provided
                const validPayload = validator
                    ? validator(parsedPayload)
                    : parsedPayload;
                // Call the notification handler
                await onNotification(validPayload);
            }
            catch (error) {
                onError(error, payload);
            }
        });
        // Store the subscription
        this.activeSubscriptions.set(channel, subscription);
    }
    /**
     * Unsubscribes from notifications on a specific channel
     *
     * @param channel - The notification channel to unsubscribe from
     * @returns A promise that resolves when unsubscribed
     */
    async unsubscribe(channel) {
        const subscription = this.activeSubscriptions.get(channel);
        if (!subscription) {
            throw new Error(`Not subscribed to channel: ${channel}`);
        }
        // Unlisten
        await subscription.unlisten();
        // Remove from active subscriptions
        this.activeSubscriptions.delete(channel);
    }
    /**
     * Unsubscribes from all active subscriptions
     *
     * @returns A promise that resolves when all unsubscriptions are complete
     */
    async unsubscribeAll() {
        const unsubscribePromises = Array.from(this.activeSubscriptions.entries()).map(async ([channel]) => {
            await this.unsubscribe(channel);
        });
        await Promise.all(unsubscribePromises);
    }
}
exports.SubscriptionClient = SubscriptionClient;
