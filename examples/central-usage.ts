import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { PgTrigger } from '../src';

// Initialize Prisma client
const prisma = new PrismaClient({
  adapter: new PrismaPg({})
});

// Initialize postgres.js client for low-level operations
// Note: You may need a separate connection for LISTEN operations
const sql = postgres(process.env.DATABASE_URL as string);

async function main() {
  // Initialize the triggers library with your Prisma client
  const triggers = new PgTrigger<typeof prisma>(sql);

  // Step 1: Create a strongly-typed notification registry with model types
  const registry = triggers
    .createRegistry()
    // Define channels with model types (fully type-checked!)
    .defineChannel('item_changes', 'item')
    .defineChannel('list_updates', 'list')
    .channel<'payment_events', { id: string; amount: number; status: string }>(
      'payment_events'
    );

  // Step 2: Create all the notification functions at once
  await registry.createAllFunctions(triggers);

  // Step 3: Define triggers that use these typed channels
  await triggers
    .defineTrigger('item', registry)
    .withName('item_status_change_trigger')
    .withTiming('AFTER')
    .onEvents('UPDATE')
    .withTypedCondition(({ NEW, OLD }) => NEW.status !== OLD.status)
    .notifyOn('item_changes')
    .create();

  // Create the notification client
  const notificationClient = triggers.createClient(registry);

  // Option 1: Subscribe to individual channels
  const itemChannel = notificationClient.channel('item_changes');
  await itemChannel.subscribe((payload) => {
    console.log(`Item ${payload.data.id} updated`);
  });

  // Option 2: Create a unified subscription with event-based interface
  const subscription = notificationClient.createSubscription();

  // Start listening to all channels
  await subscription.subscribe();

  // Add handlers for specific channels with .on()
  subscription.on('item_changes', (payload) => {
    // Fully typed - payload.data has Item type
    console.log(`Item ${payload.data.id} changed`);
  });

  subscription.on('list_updates', (payload) => {
    // Fully typed - payload.data has list type
    console.log(`list ${payload.data.id} was ${payload.operation}`);
  });

  subscription.on('payment_events', (payload) => {
    // Fully typed - payload.data has { id, amount, status }
    console.log(`Payment ${payload.data.id}: $${payload.data.amount}`);
  });

  // You can add multiple handlers for the same channel
  subscription.on('item_changes', (payload) => {
    console.log('Another handler for item changes');
  });

  // Later, remove a specific handler
  const handler = (payload: any) => console.log(payload);
  subscription.on('item_changes', handler);
  subscription.off('item_changes', handler);

  // When done, unsubscribe from everything
  await subscription.unsubscribeAll();
}

await main().catch(console.error);
