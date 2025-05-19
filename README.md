// README.md
# pg-typesafe-triggers

A TypeScript library that provides a typesafe API for defining and subscribing to PostgreSQL triggers using your Prisma client and `postgres.js`.

## Features

- **Universal Compatibility**: Works with any Prisma client, including custom generated clients
- **Fully Typesafe**: Leverages your specific Prisma schema for complete type safety
- **Generic Design**: No hardcoding of model names or fields
- **Fluent Builder API**: Create triggers using a chainable, intuitive API
- **Typesafe Condition Building**: Write trigger conditions (WHERE/WHEN clauses) with TypeScript type checking
- **Notification Subscriptions**: Subscribe to trigger notifications with typesafe payload handling

## Installation

```bash
npm install pg-typesafe-triggers postgres
```

## Quick Start

```typescript
// Works with ANY Prisma client, including custom paths!
import { PrismaClient } from '@prisma/client'; // Or your custom path
import postgres from 'postgres';
import { PgTypesafeTriggers, NotificationPayload } from 'pg-typesafe-triggers';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL);

// Initialize with your specific Prisma client type
const triggers = new PgTypesafeTriggers<typeof prisma>(sql);

// Define notification payload type
interface UserNotification extends NotificationPayload<{
  id: string;
  email: string;
  name: string | null;
}> {}

async function main() {
  // Create a notification function
  await triggers.createNotifyFunction(
    'user_notify_func',
    'user_changes'
  );
  
  // Define a trigger with full type safety
  await triggers
    .defineTrigger('user') // Autocompleted and type-checked for YOUR schema
    .withName('user_email_change_trigger')
    .withTiming('AFTER')
    .onEvents('UPDATE')
    .withTypedCondition(({ NEW, OLD }) => NEW.email !== OLD.email) // Type-checked fields
    .executeFunction('user_notify_func')
    .create();
  
  // Subscribe to notifications
  const subscriptionClient = triggers.getSubscriptionClient();
  
  await subscriptionClient.subscribe<UserNotification>('user_changes', {
    onNotification: (payload) => {
      console.log(`Received ${payload.operation} notification:`, payload.data);
    }
  });
  
  // Make changes that will trigger notifications
  const newUser = await prisma.user.create({
    data: { email: 'test@example.com', name: 'Test User' }
  });
}

main();
```

## API Documentation

### PgTypesafeTriggers

The main entry point for the library:

```typescript
// Initialize with your specific Prisma client for type safety
const triggers = new PgTypesafeTriggers<typeof prisma>(postgresClient);
```

Methods:
- `defineTrigger(modelName)`: Create a trigger builder for a model in your schema (type-checked)
- `dropTrigger(modelName, triggerName)`: Drop an existing trigger
- `createNotifyFunction(functionName, channelName)`: Create a PL/pgSQL function for sending notifications
- `getSubscriptionClient()`: Get the subscription client for listening to notifications

### TriggerBuilder

Fluent API for defining triggers:

```typescript
triggers
  .defineTrigger('user') // Auto-completed from YOUR schema!
  .withName('my_trigger')
  .withTiming('AFTER')
  .onEvents('INSERT', 'UPDATE')
  .withForEach('ROW')
  .watchColumns('email', 'name') // Type-checked from YOUR schema!
  .withTypedCondition(({ NEW, OLD }) => NEW.email !== OLD.email) // Type-checked!
  .executeFunction('notify_func')
  .create();
```

### Type-Safe Trigger Conditions

Three ways to define conditions:

```typescript
// 1. Raw SQL (simple but not type-safe)
.withCondition('NEW.email <> OLD.email')

// 2. Type-Safe Function (recommended) 
.withTypedCondition(({ NEW, OLD }) => NEW.email !== OLD.email)

// 3. Condition Builder (for complex conditions)
const condition = triggerBuilder.withConditionBuilder();
condition.fieldChanged('email'); // Type-checked from YOUR schema!
condition.where('status', '=', 'active'); // Type-checked!
condition.build();
```

### SubscriptionClient

API for subscribing to notifications:

```typescript
const client = triggers.getSubscriptionClient();

await client.subscribe<PayloadType>('channel_name', {
  onNotification: (payload) => {
    // Handle notification with type checking
  },
  onError: (error) => console.error(error)
});

// Later:
await client.unsubscribe('channel_name');
```

## Trigger Functions

The library can create notification functions that send payloads to specific notification channels:

```typescript
await triggers.createNotifyFunction(
  'user_notify_func',   // Name of the function to create
  'user_changes'        // Channel name to send notifications on
);
```

The generated function:
1. Captures data changes (NEW/OLD records)
2. Creates a JSON payload with operation type and data
3. Sends a notification via PostgreSQL's `pg_notify`
4. Returns the appropriate value to complete the trigger

## Development

```bash
# Start Prisma Postgres for local development 
npx prisma dev

# Apply Prisma schema to the database
npx prisma migrate dev

# Run example
npm run example

# Build the library
npm run build
```

## License

MIT