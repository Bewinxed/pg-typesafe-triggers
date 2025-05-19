// examples/basic-usage.ts
import { PrismaClient } from '../src/generated/prisma'; // Custom Prisma client path
import postgres from 'postgres';
import { PgTypesafeTriggers, NotificationPayload } from '../src';

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize postgres.js client for low-level operations
// Note: You may need a separate connection for LISTEN operations
const sql = postgres(process.env.DATABASE_URL as string);

// Initialize our trigger library with your specific Prisma client type
const triggers = new PgTypesafeTriggers<typeof prisma>(sql);

// Define the shape of our notification payload
interface ItemNotification
  extends NotificationPayload<{
    id: string;
    name: string;
    status: string;
    listId: string | null;
  }> {}

async function main() {
  try {
    // Step 1: Create a notification function
    await triggers.createNotifyFunction('item_notify_func', 'item_changes');
    console.log('✅ Created notification function');

    // Step 2: Define a trigger using the builder pattern with typesafe conditions
    // The modelName and fields are now typechecked according to YOUR prisma client!
    await triggers
      .defineTrigger('item') // Auto-completed and type-checked for your schema
      .withName('item_status_change_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withTypedCondition(({ NEW, OLD }) => NEW.status !== OLD.status) // Type-checked fields
      .executeFunction('item_notify_func')
      .create();

    console.log('✅ Created status change trigger on Item table');

    // Example 2: Using the condition builder for more complex cases
    const priceIncreaseTrigger = triggers
      .defineTrigger('item')
      .withName('item_price_increase_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE');

    const condition = priceIncreaseTrigger.withConditionBuilder();
    condition.fieldChanged('status'); // Type-checked with auto-completion
    condition.build();

    await priceIncreaseTrigger.executeFunction('item_notify_func').create();

    console.log('✅ Created price increase trigger on Item table');

    // Step 3: Subscribe to notifications
    const subscriptionClient = triggers.getSubscriptionClient();

    await subscriptionClient.subscribe<ItemNotification>('item_changes', {
      onNotification: (payload) => {
        console.log(`Received ${payload.operation} notification:`);
        console.log(payload.data);
      },
      onError: (error) => console.error('Subscription error:', error)
    });

    console.log('✅ Subscribed to item_changes channel');

    // Step 4: Make changes to the database to trigger notifications
    console.log('Creating a new item...');
    const newItem = await prisma.item.create({
      data: {
        name: 'Test Item',
        status: 'pending'
      }
    });

    // Wait a moment for the notification to be processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('Updating the item...');
    await prisma.item.update({
      where: { id: newItem.id },
      data: { status: 'completed' }
    });

    // Wait a moment for the notification to be processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('Deleting the item...');
    await prisma.item.delete({
      where: { id: newItem.id }
    });

    // Wait for final notification
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Cleanup: Unsubscribe and drop the trigger
    await subscriptionClient.unsubscribe('item_changes');
    await triggers.dropTrigger('item', 'item_changes_trigger');

    console.log('✅ Cleaned up trigger and subscription');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close connections
    await prisma.$disconnect();
    await sql.end();
  }
}

// Run the example
main().catch(console.error);
