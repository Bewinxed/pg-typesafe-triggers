import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import {
  PgTriggerManager,
  TriggerTiming,
  TriggerOperation,
  TriggerForEach,
  NotificationPayload
} from '../src';

// Initialize Prisma client
const prisma = new PrismaClient({
  adapter: new PrismaPg({})
});

// Initialize postgres.js client for low-level operations
const sql = postgres(process.env.DATABASE_URL as string);

async function main() {
  // Initialize the triggers library with your Prisma client
  const triggers = new PgTriggerManager<typeof prisma>(sql);

  // Step 1: Create a strongly-typed notification registry with model types
  const registry = triggers
    .createRegistry()
    // Define channels with model types (fully type-checked!)
    .modelChannel('item_changes', 'item')
    .modelChannel('list_updates', 'list')
    .customChannel<
      'payment_events',
      { id: string; amount: number; status: string }
    >('payment_events');

  // Step 2: Create all the notification functions at once
  await registry.createAllFunctions(triggers);

  // Step 3: Define triggers using the object-based approach
  await triggers
    .defineTrigger({
      modelName: 'item',
      triggerName: 'item_status_change_trigger',
      timing: TriggerTiming.AFTER,
      events: [TriggerOperation.UPDATE],
      forEach: TriggerForEach.ROW,
      condition: ({ NEW, OLD }) => NEW.status !== OLD.status,
      // Use the function name that the registry created
      functionName: 'item_changes_notify_func'
    })
    .create();

  // Alternative approach for different models
  await triggers
    .defineTrigger({
      modelName: 'list',
      triggerName: 'list_update_trigger',
      timing: TriggerTiming.AFTER,
      events: [TriggerOperation.UPDATE, TriggerOperation.INSERT],
      // Use the function name that the registry created
      functionName: 'list_updates_notify_func'
    })
    .create();

  // Create the notification client
  const notificationClient = triggers.createClient(registry);

  // Option 1: Subscribe to individual channels with type safety
  const itemChannel = notificationClient.channel('item_changes');
  await itemChannel.subscribe((payload) => {
    // payload is fully typed based on the 'item' model
    console.log(`Item ${payload.data.id} updated`);
  });

  // Option 2: Create a unified subscription with event-based interface
  const subscription = notificationClient.createSubscription();

  // Start listening to all channels
  await subscription.subscribe();

  // Add handlers for specific channels with .on()
  subscription.on('item_changes', (payload) => {
    // Fully typed - payload.data has Item type
    console.log(`Item ${payload.data.id} changed to ${payload.data.status}`);
  });

  subscription.on('list_updates', (payload) => {
    // Fully typed - payload.data has list type
    console.log(`List ${payload.data.id} was ${payload.operation}`);
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
  const handler = (payload: NotificationPayload<any>) => console.log(payload);
  subscription.on('item_changes', handler);
  subscription.off('item_changes', handler);

  // When done, unsubscribe from everything
  await subscription.unsubscribeAll();
}

main().catch(console.error);
