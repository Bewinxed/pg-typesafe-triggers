import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { TriggerManager } from '../src/trigger/manager';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL!);

// Initialize trigger manager with your specific Prisma client type
const triggerManager = new TriggerManager<typeof prisma>(sql);

async function main() {
  // Define a trigger with full type safety
  const trigger = triggerManager
    .defineTrigger('item') // Autocompleted and type-checked for YOUR schema
    .withName('item_status_change_trigger')
    .withTiming('AFTER')
    .onEvents('UPDATE')
    .withCondition(({ NEW, OLD }) => NEW.status !== OLD.status) // Type-checked fields
    .notifyOn('item_changes'); // Creates notification function automatically

  // Set up database (creates functions and triggers)
  await trigger.setupDatabase();

  // Start listening for notifications
  await trigger.getManager().startListening();

  // Add handlers for notifications
  trigger.getManager().on('item_changes', (payload) => {
    console.log(
      `Item ${payload.data.id} status changed to ${payload.data.status}`
    );
  });

  // Test the trigger
  await prisma.item.update({
    where: { id: 'some-id' },
    data: { status: 'completed' }
  });
}

main();
