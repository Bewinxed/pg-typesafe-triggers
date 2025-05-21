// examples/flexible-condition-usage.ts
import postgres from 'postgres';
import {
  PgTriggerManager,
  NotificationPayload,
  TriggerTiming,
  TriggerOperation
} from '../src';
import { PrismaClient } from '@prisma/client';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL as string);

// Initialize trigger manager
const triggerManager = new PgTriggerManager<typeof prisma>(sql);

// Define the notification payload type
interface ItemNotification
  extends NotificationPayload<{
    id: string;
    name: string;
    status: string;
  }> {}

async function main() {
  try {
    // Create notification function
    await triggerManager.createNotifyFunction(
      'item_notify_func',
      'item_changes'
    );

    // Example 1: Using a function for the condition
    const functionTrigger = triggerManager.defineTrigger({
      modelName: 'item',
      triggerName: 'function_condition_trigger',
      timing: 'AFTER',
      events: ['UPDATE'],
      // TypeScript function that gets converted to SQL
      condition: ({ NEW, OLD }) => NEW.status !== OLD.status,
      functionName: 'item_notify_func'
    });

    // Example 2: Using a raw SQL string for the condition
    const sqlTrigger = triggerManager.defineTrigger({
      modelName: 'item',
      triggerName: 'sql_condition_trigger',
      timing: TriggerTiming.BEFORE,
      events: [TriggerOperation.UPDATE],
      // Direct SQL condition
      condition: 'NEW."name" LIKE \'Special%\'',
      functionName: 'item_notify_func'
    });

    // Example 3: Setting the condition after definition
    const laterDefinedTrigger = triggerManager.defineTrigger({
      modelName: 'item',
      triggerName: 'later_defined_trigger',
      timing: 'AFTER',
      events: ['UPDATE'],
      functionName: 'item_notify_func'
    });

    // Can set the condition later with either a function or SQL string
    laterDefinedTrigger.setCondition(({ NEW, OLD }) => NEW.name !== OLD.name);
    // Could also use: laterDefinedTrigger.setCondition('NEW."name" <> OLD."name"');

    // Create the triggers in the database
    await functionTrigger.create();
    await sqlTrigger.create();
    await laterDefinedTrigger.create();

    // Subscribe to notifications
    const subscriptionClient = triggerManager.getSubscriptionClient();
    await subscriptionClient.subscribe<ItemNotification>('item_changes', {
      onNotification: (payload) => {
        console.log(
          `Received ${payload.operation} notification:`,
          payload.data
        );
      }
    });

    // Create an item that should trigger the SQL condition
    const item = await prisma.item.create({
      data: { name: 'Special Item', status: 'pending' }
    });

    // Update the status to trigger the function condition
    await prisma.item.update({
      where: { id: item.id },
      data: { status: 'completed' }
    });

    // Update the name to trigger the later defined condition
    await prisma.item.update({
      where: { id: item.id },
      data: { name: 'Renamed Special Item' }
    });

    // Check if triggers exist and drop them
    console.log(`Function trigger exists: ${await functionTrigger.exists()}`);
    await functionTrigger.drop();
    await sqlTrigger.drop();
    await laterDefinedTrigger.drop();

    // Unsubscribe
    await subscriptionClient.unsubscribe('item_changes');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    await prisma.$disconnect();
    await sql.end();
  }
}

main().catch(console.error);
