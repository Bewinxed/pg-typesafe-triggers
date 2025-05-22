# pg-typesafe-triggers

![ComfyUI_00006_](https://github.com/user-attachments/assets/8aef8bac-282c-4316-8a59-bc6f17dc5544)

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
- **Centralized Registry**: Manage multiple triggers and channels in one place
- **Individual Triggers**: Define and manage triggers independently

## Installation

```bash
npm install pg-typesafe-triggers postgres
```

Make sure you have Prisma v6.0 or later installed as a peer dependency.

## Quick Start

There are two ways to use this library:

### Approach 1: Individual Trigger Management

This approach is great when you want to define and manage triggers individually:

```typescript
import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { TriggerManager } from 'pg-typesafe-triggers';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL);

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
    console.log(`Item ${payload.data.id} status changed to ${payload.data.status}`);
  });

  // Test the trigger
  await prisma.item.update({
    where: { id: 'some-id' },
    data: { status: 'completed' }
  });
}

main();
```

### Approach 2: Centralized Registry

This approach uses a centralized registry for better organization of multiple triggers:

```typescript
import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { Registry } from 'pg-typesafe-triggers';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL);

// Initialize registry with your specific Prisma client type
const registry = new Registry<typeof prisma>(sql);

async function main() {
  // Step 1: Configure models and their default triggers
  registry
    .models('item', 'list', 'uwU') // Add models to watch
    .model('item')
    .onEvents('INSERT', 'UPDATE', 'DELETE') // Configure events for item
    .model('list')
    .onEvents('INSERT', 'UPDATE', 'DELETE') // Configure events for list
    .model('uwU')
    .onEvents('INSERT'); // Only watch inserts for uwU

  // Step 2: Add custom triggers for specific conditions
  registry
    .model('item')
    .trigger('status_changes', {
      on: ['UPDATE'],
      when: ({ NEW, OLD }) => NEW.status !== OLD.status
    });

  // Step 3: Add custom channels for non-model events
  registry.custom('payment_events', { id: 'string', amount: 'number', status: 'string' });

  // Step 4: Set up database and start listening
  await registry.setup(); // Creates all functions, triggers, and starts listening

  // Step 5: Add handlers for different channels
  registry.on('item', (payload) => {
    // Fully typed - payload.data has Item type
    console.log(`Item ${payload.data.id} was ${payload.operation}`);
  });

  registry.on('list', (payload) => {
    // Fully typed - payload.data has List type
    console.log(`List ${payload.data.name} was ${payload.operation}`);
  });

  registry.on('status_changes', (payload) => {
    // Custom trigger handler
    console.log(`Item status changed: ${payload.data.status}`);
  });

  registry.on('payment_events', (payload) => {
    // Custom channel handler
    console.log(`Payment: $${payload.data.amount}`);
  });

  // Test the triggers
  await prisma.item.create({ data: { name: 'Test Item', status: 'pending' } });
  await prisma.item.update({ 
    where: { id: 'some-id' }, 
    data: { status: 'completed' } 
  });
}

main();
```

## API Reference

### TriggerManager (Individual Approach)

#### Creating a Trigger

```typescript
const trigger = triggerManager
  .defineTrigger('modelName') // Your Prisma model name (type-checked)
  .withName('trigger_name') // Unique trigger name
  .withTiming('AFTER') // BEFORE, AFTER, or INSTEAD OF
  .onEvents('INSERT', 'UPDATE') // Database events
  .withCondition(({ NEW, OLD }) => NEW.field !== OLD.field) // Type-safe condition
  .notifyOn('channel_name'); // Notification channel

// Set up in database
await trigger.setupDatabase();
```

#### Trigger Configuration Options

```typescript
// Timing
.withTiming('BEFORE' | 'AFTER' | 'INSTEAD OF')

// Events
.onEvents('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')

// Watch specific columns (for UPDATE)
.watchColumns('column1', 'column2') // Type-checked column names

// Conditions
.withCondition(({ NEW, OLD }) => boolean) // Type-safe function
.withCondition('NEW."status" = \'active\'') // Raw SQL string

// Function execution
.executeFunction('function_name', 'arg1', 'arg2') // Custom function
.notifyOn('channel_name') // Auto-creates notification function
```

#### Managing Triggers

```typescript
// Set up database (create functions and triggers)
await trigger.setupDatabase();

// Start listening for notifications
await trigger.getManager().startListening();

// Stop listening
await trigger.getManager().stopListening();

// Add notification handlers
trigger.getManager().on('channel_name', (payload) => {
  console.log('Received:', payload);
});

// Remove notification handlers
trigger.getManager().off('channel_name', handlerFunction);

// Drop the trigger
await trigger.getManager().dropTrigger();

// Get status
const status = trigger.getManager().getStatus();
```

### Registry (Centralized Approach)

#### Basic Setup

```typescript
const registry = new Registry<typeof prisma>(sql);

// Add models to watch
registry.models('user', 'post', 'comment');

// Configure model-specific settings
registry
  .model('user')
  .onEvents('INSERT', 'UPDATE', 'DELETE')
  .when(({ NEW, OLD }) => NEW.email !== OLD.email);

// Add custom channels
registry.custom('audit_events', { 
  action: 'string', 
  userId: 'string', 
  timestamp: 'string' 
});

// Set up everything
await registry.setup();
```

#### Custom Triggers

```typescript
// Add custom triggers to models
registry
  .model('user')
  .trigger('email_changes', {
    on: ['UPDATE'],
    when: ({ NEW, OLD }) => NEW.email !== OLD.email,
    timing: 'AFTER'
  });

// Add custom triggers with column watching
registry
  .model('post')
  .trigger('status_publishing', {
    on: ['UPDATE'],
    columns: ['status', 'published_at'],
    when: ({ NEW }) => NEW.status === 'published'
  });
```

#### Event Handling

```typescript
// Handle model events (uses model name as channel)
registry.on('user', (payload) => {
  // payload.data is typed as User
  console.log(`User ${payload.data.id} was ${payload.operation}`);
});

// Handle custom trigger events (uses trigger name as channel)
registry.on('email_changes', (payload) => {
  console.log(`Email changed for user ${payload.data.id}`);
});

// Handle custom channel events
registry.on('audit_events', (payload) => {
  console.log(`Audit: ${payload.data.action} by ${payload.data.userId}`);
});

// Remove handlers
registry.off('user', handlerFunction);
```

#### Registry Management

```typescript
// Get registry status
const status = registry.getStatus();
console.log({
  isSetup: status.isSetup,
  isListening: status.isListening,
  modelChannels: status.modelChannels,
  customChannels: status.customChannels
});

// Stop listening
await registry.stopListening();
```

## Trigger Conditions

### Type-Safe Function Conditions

```typescript
// Simple field comparison
.withCondition(({ NEW, OLD }) => NEW.status !== OLD.status)

// Complex boolean logic
.withCondition(({ NEW, OLD }) => 
  OLD.status === 'pending' && NEW.status === 'completed'
)

// Multiple field checks
.withCondition(({ NEW, OLD }) => 
  NEW.email !== OLD.email || NEW.name !== OLD.name
)
```

### Raw SQL Conditions

```typescript
// Simple SQL condition
.withCondition('NEW."status" = \'active\'')

// Complex SQL with multiple conditions
.withCondition('NEW."price" > OLD."price" AND NEW."status" = \'published\'')

// Pattern matching
.withCondition('NEW."email" LIKE \'%@company.com\'')
```

## Notification Payloads

All notifications follow this structure:

```typescript
interface NotificationPayload<T> {
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
  timestamp: string;
  data: T; // Your model type or custom schema
}
```

Example payload:

```typescript
{
  operation: 'UPDATE',
  timestamp: '2023-10-15T10:30:00.000Z',
  data: {
    id: 'user-123',
    name: 'John Doe',
    email: 'john@example.com',
    status: 'active'
  }
}
```

## Error Handling

```typescript
// Individual trigger error handling
trigger.getManager().on('channel_name', (payload) => {
  try {
    // Handle notification
  } catch (error) {
    console.error('Handler error:', error);
  }
});

// Registry error handling is built-in
// Errors in one handler won't affect others
```

## Best Practices

### Individual Triggers
- Use for simple, isolated trigger requirements
- Good for microservices or single-purpose applications
- Easy to test and debug individual triggers

### Registry Approach
- Use for applications with multiple related triggers
- Better organization and management of complex trigger systems
- Unified subscription handling reduces connection overhead
- Easier to maintain consistent notification patterns

### General Tips
- Always use type-safe conditions when possible
- Prefer specific event types over listening to all events
- Use column watching for UPDATE triggers to improve performance
- Handle errors gracefully in notification handlers
- Clean up triggers when shutting down your application

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