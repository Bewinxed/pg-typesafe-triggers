// tests/setup.ts
import { afterAll, beforeAll } from 'bun:test';
// Import postgres types correctly
import postgres from 'postgres';
import { PrismaPg } from '@prisma/adapter-pg';
import type { ListenRequest } from 'postgres';
import { PgTypesafeTriggers } from '../src';
import { PrismaClient } from '@prisma/client';

// Global test objects
export let prisma: PrismaClient | null = null;
export let pgClient: postgres.Sql | null = null;
export let triggers: PgTypesafeTriggers<any> | null = null;

// Track active listen requests for proper cleanup
const activeListeners: ListenRequest[] = [];

// Notification channel trackers for tests
export const receivedNotifications: Record<string, any[]> = {
  insert_test: [],
  update_test: [],
  delete_test: [],
  condition_test: []
};

// Use direct database connection for tests
// No pg-testdb required - keep it simple!
beforeAll(async () => {
  console.log('Setting up test environment...');

  try {
    // Use environment variables for connection or fallback to defaults
    const DATABASE_URL =
      process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

    if (!DATABASE_URL) {
      throw new Error(
        'Neither TEST_DATABASE_URL nor DATABASE_URL environment variable is set'
      );
    }

    console.log('Using database:', DATABASE_URL.replace(/:[^:]+@/, ':****@'));

    // Initialize Prisma client with the same adapter configuration as your app
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: DATABASE_URL
      })
    });

    // Initialize postgres.js client
    pgClient = postgres(DATABASE_URL);

    // Initialize triggers client
    triggers = new PgTypesafeTriggers<typeof prisma>(pgClient);

    // Clean up any existing data for a fresh start
    console.log('Cleaning up existing data...');
    await prisma.item.deleteMany({});
    await prisma.list.deleteMany({});
    await prisma.uwU.deleteMany({});

    // Create notification functions for each test type
    console.log('Creating notification functions...');
    await triggers.createNotifyFunction('insert_notify_func', 'insert_test');
    await triggers.createNotifyFunction('update_notify_func', 'update_test');
    await triggers.createNotifyFunction('delete_notify_func', 'delete_test');
    await triggers.createNotifyFunction(
      'condition_notify_func',
      'condition_test'
    );

    // Set up listeners for all notification channels
    console.log('Setting up notification listeners...');

    // Use raw postgres.js for listening to be sure notifications work
    if (pgClient) {
      // Set up raw listeners on each channel
      const channels = [
        'insert_test',
        'update_test',
        'delete_test',
        'condition_test'
      ];

      for (const channel of channels) {
        pgClient.listen(channel, (payload) => {
          try {
            // Parse the payload
            const parsedPayload = JSON.parse(payload);
            // Store in our notification tracker
            console.log(`Received notification on ${channel}:`, parsedPayload);
            receivedNotifications[channel].push(parsedPayload);
          } catch (error) {
            console.error(`Error handling notification on ${channel}:`, error);
          }
        });
      }
    }

    // Check what tables actually exist in the database
    console.log('Checking existing tables...');
    const tablesResult = await pgClient.unsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(
      'Tables in the database:',
      tablesResult.map((row) => row.table_name)
    );
  } catch (error) {
    console.error('Error in test setup:', error);
    throw error;
  }
});

// Cleanup after all tests
afterAll(async () => {
  console.log('Cleaning up test environment...');

  try {
    // Unsubscribe from all channels using the unlisten method
    for (const listener of activeListeners) {
      if (listener) {
        // Wait for the ListenRequest to resolve to ListenMeta
        const meta = await listener;
        // Call unlisten() on the meta object
        await meta.unlisten();
      }
    }

    // Clean up any test data
    if (prisma) {
      await prisma.item.deleteMany({});
      await prisma.list.deleteMany({});
      await prisma.uwU.deleteMany({});
    }

    // Close connections
    // if (prisma) await prisma.$disconnect();
    // if (pgClient) await pgClient.end();

    console.log('Test cleanup complete');
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
});

// Utility function to reset notification trackers
export function resetNotifications() {
  Object.keys(receivedNotifications).forEach((key) => {
    receivedNotifications[key] = [];
  });
}

/**
 * Wait for a specific number of notifications on a channel
 */
export async function waitForNotifications(
  channel: string,
  count: number,
  timeout: number = 2000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (receivedNotifications[channel].length >= count) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Assert that a notification payload has expected properties
 */
export function assertNotificationPayload(
  payload: any,
  expectedOperation: string,
  expectedData: Record<string, any>
) {
  if (!payload) {
    throw new Error(`Expected payload but got ${payload}`);
  }

  if (payload.operation !== expectedOperation) {
    throw new Error(
      `Expected operation ${expectedOperation} but got ${payload.operation}`
    );
  }

  if (!payload.timestamp) {
    throw new Error('Expected timestamp in payload');
  }

  // Check that each expected data property is present
  Object.entries(expectedData).forEach(([key, value]) => {
    if (value !== undefined) {
      if (payload.data[key] !== value) {
        throw new Error(
          `Expected data.${key} to be ${value} but got ${payload.data[key]}`
        );
      }
    } else if (payload.data[key] === undefined) {
      throw new Error(`Expected data.${key} to be defined`);
    }
  });
}
