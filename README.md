# pg-typesafe-triggers

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)

A TypeScript library that provides a typesafe API for defining and subscribing to PostgreSQL triggers using your Prisma client and `postgres.js`.

## Features

- **Universal Compatibility**: Works with any Prisma client, including custom generated clients
- **Fully Typesafe**: Leverages your specific Prisma schema for complete type safety
- **Generic Design**: No hardcoding of model names or fields
- **Fluent Builder API**: Create triggers using a chainable, intuitive API
- **Typesafe Condition Building**: Write trigger conditions (WHERE/WHEN clauses) with TypeScript type checking
- **Notification Subscriptions**: Subscribe to trigger notifications with typesafe payload handling
- **Centralized Event Registry**: Define all your events in one place with a registry-based approach
- **Multi-channel Subscription**: Subscribe to multiple notification channels with an event-based interface

## Installation

```bash
npm install pg-typesafe-triggers postgres
```

Make sure you have Prisma v6.0 or later installed as a peer dependency.

## Quick Start

Here are two ways to use this library:

### Approach 1: Individual Trigger Definitions

This approach is great when you want to define and manage triggers individually:

```typescript
import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { PgTypesafeTriggers, NotificationPayload } from 'pg-typesafe-triggers';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL);

// Initialize with your specific Prisma client type
const triggers = new PgTypesafeTriggers<typeof prisma>(sql);

// Define notification payload type
interface UserNotification
  extends NotificationPayload<{
    id: string;
    email: string;
    name: string | null;
  }> {}

async function main() {
  // Create a notification function
  await triggers.createNotifyFunction('user_notify_func', 'user_changes');

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
}

main();
```

### Approach 2: Centralized Registry

This approach uses a centralized registry for better organization of triggers and subscriptions:

```typescript
import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { PgTypesafeTriggers } from 'pg-typesafe-triggers';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL);

// Initialize with your specific Prisma client type
const triggers = new PgTypesafeTriggers<typeof prisma>(sql);

async function main() {
  // Step 1: Create a strongly-typed notification registry with model types
  const registry = triggers
    .createRegistry()
    // Define channels with model types (fully type-checked!)
    .defineChannel('user_changes', 'user')
    .defineChannel('post_updates', 'post')
    .channel<'payment_events', { id: string; amount: number; status: string }>(
      'payment_events'
    );

  // Step 2: Create all the notification functions at once
  await registry.createAllFunctions(triggers);

  // Step 3: Define triggers that use these typed channels
  await triggers
    .defineTrigger('user', registry)
    .withName('user_status_change_trigger')
    .withTiming('AFTER')
    .onEvents('UPDATE')
    .withTypedCondition(({ NEW, OLD }) => NEW.status !== OLD.status)
    .notifyOn('user_changes') // Automatically links to the correct function
    .create();

  // Step 4: Create a unified subscription with event-based interface
  const subscription = triggers.createClient(registry).createSubscription();

  // Start listening to all channels
  await subscription.subscribe();

  // Add handlers for specific channels
  subscription.on('user_changes', (payload) => {
    // Fully typed - payload.data has User type
    console.log(
      `User ${payload.data.id} changed status to ${payload.data.status}`
    );
  });

  subscription.on('post_updates', (payload) => {
    // Fully typed - payload.data has Post type
    console.log(`Post ${payload.data.id} was ${payload.operation}`);
  });
}

main();
```

## Trigger Definitions

### Defining Triggers

The library provides a fluent API for defining PostgreSQL triggers:

```typescript
// Create a basic trigger
await triggers
  .defineTrigger('user') // Model name (auto-completed from YOUR schema!)
  .withName('my_trigger') // Unique name for this trigger
  .withTiming('AFTER') // BEFORE, AFTER, or INSTEAD OF
  .onEvents('INSERT', 'UPDATE') // Database events that activate the trigger
  .executeFunction('notify_func') // The function to execute
  .create(); // Create the trigger in the database
```

### Trigger Timing and Events

You can specify when triggers fire and on which events:

```typescript
// Fire before insert or update
.withTiming('BEFORE')
.onEvents('INSERT', 'UPDATE')

// Fire after deletion
.withTiming('AFTER')
.onEvents('DELETE')

// Fire on multiple events
.onEvents('INSERT', 'UPDATE', 'DELETE')
```

### Watching Specific Columns

For UPDATE triggers, you can specify which columns to watch:

```typescript
// Only fire when email or status columns change
.onEvents('UPDATE')
.watchColumns('email', 'status') // Type-checked from YOUR schema!
```

## Trigger Conditions

### Type-Safe Conditions

Write trigger conditions with full TypeScript type safety:

```typescript
// 1. Raw SQL (simple but not type-safe)
.withCondition('NEW.email <> OLD.email')

// 2. Type-Safe Function (recommended)
.withTypedCondition(({ NEW, OLD }) => NEW.email !== OLD.email)

// 3. Condition Builder (for complex conditions)
const condition = triggerBuilder.withConditionBuilder();
condition.fieldChanged('email'); // Type-checked from YOUR schema!
condition.where('status', '=', 'active'); // Type-checked!
condition.build(); // Applies AND logic between conditions

// OR logic
const condition = triggerBuilder.withConditionBuilder();
condition.where('name', '=', 'Test Item');
condition.where('status', '=', 'special');
condition.buildOr(); // Applies OR logic between conditions
```

### Complex Conditions

For more complex conditions, you can build them programmatically:

```typescript
// Complex conditions with field comparisons
.withTypedCondition(({ OLD, NEW }) =>
  OLD.status === 'pending' && NEW.status === 'completed'
)

// Detection of status transitions
.withTypedCondition(({ OLD, NEW }) =>
  OLD.status !== NEW.status && NEW.status === 'active'
)
```

## Notification Functions

The library can create notification functions that send payloads to specific channels:

```typescript
// Create a notification function
await triggers.createNotifyFunction(
  'user_notify_func', // Name of the function to create
  'user_changes' // Channel name to send notifications on
);
```

## Subscribing to Notifications

### Basic Subscription

Subscribe to notifications from a specific channel:

```typescript
const client = triggers.getSubscriptionClient();

await client.subscribe<UserNotification>('user_changes', {
  onNotification: (payload) => {
    console.log(`User ${payload.data.id} was ${payload.operation}`);
    console.log('Updated data:', payload.data);
  },
  onError: (error) => console.error(error)
});

// Later, unsubscribe:
await client.unsubscribe('user_changes');
```

### Centralized Notification Registry

For larger applications, use the registry-based approach for better organization:

```typescript
// Create a typed registry
const registry = triggers
  .createRegistry()
  .defineChannel('user_changes', 'user')
  .defineChannel('post_changes', 'post');

// Create notification functions for all channels
await registry.createAllFunctions(triggers);

// Create the client
const notificationClient = triggers.createClient(registry);

// Option 1: Subscribe to individual channels
const userChannel = notificationClient.channel('user_changes');
await userChannel.subscribe((payload) => {
  console.log(`User ${payload.data.id} updated`);
});

// Option 2: Create a unified subscription
const subscription = notificationClient.createSubscription();
await subscription.subscribe(); // Start listening to all channels

// Add handlers with .on()
subscription.on('user_changes', (payload) => {
  console.log(`User ${payload.data.id} changed`);
});

subscription.on('post_changes', (payload) => {
  console.log(`Post ${payload.data.title} was ${payload.operation}`);
});

// Remove a specific handler
subscription.off('user_changes', specificHandler);

// Unsubscribe from everything
await subscription.unsubscribeAll();
```

## Development

```bash
# Clone the repository
git clone https://github.com/bewinxed/pg-typesafe-triggers.git
cd pg-typesafe-triggers

# Install dependencies
npm install

# Start Postgres for local development
npm run db:up

# Apply Prisma schema to the database
npm run db:setup

# Run tests
npm test

# Build the library
npm run build
```

## License

MIT
