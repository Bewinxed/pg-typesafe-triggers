import postgres from 'postgres';
import { SubscribeOptions } from '../types/core';
/**
 * Client for subscribing to PostgreSQL notifications
 */
export declare class SubscriptionClient<Client> {
    private sql;
    private activeSubscriptions;
    /**
     * Creates a new SubscriptionClient instance
     *
     * @param sql - A postgres.js client instance
     */
    constructor(sql: postgres.Sql);
    /**
     * Subscribes to notifications on a specific channel
     *
     * @template T - The expected shape of the notification payload
     * @param channel - The notification channel to listen to
     * @param options - Options for handling notifications
     * @returns A promise that resolves when the subscription is active
     */
    subscribe<T>(channel: string, options: SubscribeOptions<T>): Promise<void>;
    /**
     * Unsubscribes from notifications on a specific channel
     *
     * @param channel - The notification channel to unsubscribe from
     * @returns A promise that resolves when unsubscribed
     */
    unsubscribe(channel: string): Promise<void>;
    /**
     * Unsubscribes from all active subscriptions
     *
     * @returns A promise that resolves when all unsubscriptions are complete
     */
    unsubscribeAll(): Promise<void>;
}
