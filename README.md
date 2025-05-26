# 🎯 pg-typesafe-triggers

[![CI](https://github.com/bewinxed/pg-typesafe-triggers/actions/workflows/ci.yml/badge.svg)](https://github.com/bewinxed/pg-typesafe-triggers/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/pg-typesafe-triggers.svg)](https://badge.fury.io/js/pg-typesafe-triggers)
[![npm downloads](https://img.shields.io/npm/dm/pg-typesafe-triggers.svg)](https://www.npmjs.com/package/pg-typesafe-triggers)

![ComfyUI_00006_](https://github.com/user-attachments/assets/8aef8bac-282c-4316-8a59-bc6f17dc5544)

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)

A friendly TypeScript library that brings the power of PostgreSQL triggers to your Prisma workflow! 🚀

Never write SQL trigger syntax again - define your database triggers using a beautiful, type-safe API that integrates seamlessly with your existing Prisma schema.

## ✨ Features

- 🌍 **Universal Compatibility**: Works with any Prisma client, including custom generated clients
- 🛡️ **Fully Typesafe**: Leverages your specific Prisma schema for complete type safety
- 🎨 **Generic Design**: No hardcoding of model names or fields - it just works with YOUR schema!
- 🔗 **Fluent Builder API**: Create triggers using a chainable, intuitive API that feels natural
- 🎯 **Typesafe Condition Building**: Write trigger conditions with full TypeScript intellisense
- 📬 **Real-time Notifications**: Subscribe to database changes with type-safe payload handling
- 📚 **Multiple Approaches**: Use individual triggers or a centralized registry - your choice!
- 🚀 **Zero SQL Required**: No need to remember PostgreSQL trigger syntax ever again

## 📦 Installation

```bash
npm install pg-typesafe-triggers
# or
yarn add pg-typesafe-triggers
# or
pnpm add pg-typesafe-triggers
# or
bun add pg-typesafe-triggers
```

**Prerequisites:**
- Prisma v4.0 or later
- PostgreSQL database
- `postgres` package (for database connections)

## 🚀 Quick Start

Choose your adventure! We offer two delightful ways to work with triggers:

### 🎯 Approach 1: Fluent Builder API

Perfect for when you want fine-grained control over individual triggers:

```typescript
import { createTriggers } from 'pg-typesafe-triggers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const triggers = createTriggers<typeof prisma>(process.env.DATABASE_URL!);

// Create a beautiful, type-safe trigger ✨
const itemTrigger = triggers
  .for('item')  // 👈 Your model names are auto-completed!
  .withName('notify_item_changes')
  .after()
  .on('INSERT', 'UPDATE')
  .when((c) => c.NEW('status').eq('completed'))  // 👈 Type-safe conditions!
  .notify('item_updates')
  .build();

// Set it up and start listening
await itemTrigger.setup();
await itemTrigger.listen();

// React to changes in real-time! 🎉
itemTrigger.subscribe((event) => {
  console.log(`Item ${event.data.name} is now ${event.data.status}!`);
});

// Your trigger fires automatically when conditions are met
await prisma.item.create({
  data: { 
    name: 'Important Task',
    status: 'completed'  // This will trigger our notification!
  }
});
```

### 📚 Approach 2: Registry Pattern

Ideal for managing multiple triggers across your application:

```typescript
import { createTriggers } from 'pg-typesafe-triggers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const triggers = createTriggers<typeof prisma>(process.env.DATABASE_URL!);

// Create a registry to organize all your triggers 📁
const registry = triggers.registry();

// Add multiple models with their triggers in one go!
registry
  .add('item', {
    events: ['INSERT', 'UPDATE', 'DELETE'],
    timing: 'AFTER',
    forEach: 'ROW',
    notify: 'item_events'
  })
  .add('user', {
    events: ['INSERT', 'UPDATE'],
    timing: 'AFTER',
    forEach: 'ROW',
    notify: 'user_events'
  })
  .add('order', {
    events: ['INSERT'],
    timing: 'AFTER',
    forEach: 'ROW',
    when: (c) => c.NEW('status').eq('confirmed'),
    notify: 'confirmed_orders'
  });

// Set up everything with one command! 🎪
await registry.setup();
await registry.listen();

// Subscribe to all your channels elegantly
registry.on('item', (event) => {
  console.log(`Item event: ${event.operation} on ${event.data.name}`);
});

registry.on('user', (event) => {
  console.log(`New user registered: ${event.data.email}`);
});

registry.on('confirmed_orders', (event) => {
  console.log(`Order confirmed! Amount: $${event.data.total}`);
  // Send confirmation email, update inventory, etc.
});
```

## 🤔 Why pg-typesafe-triggers?

**Before** (writing raw SQL triggers):
```sql
CREATE OR REPLACE FUNCTION notify_item_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM pg_notify('item_updates', json_build_object(
      'operation', TG_OP,
      'data', row_to_json(NEW)
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER item_status_trigger
AFTER INSERT OR UPDATE ON "Item"
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION notify_item_change();
```

**After** (with pg-typesafe-triggers):
```typescript
triggers
  .for('item')
  .after()
  .on('INSERT', 'UPDATE')
  .when((c) => c.NEW('status').eq('completed'))
  .notify('item_updates')
  .build();
```

✨ **Same result, 10x less code, 100% type-safe!**

## 📖 API Reference

### 🔨 Building Triggers

```typescript
// Fluent Builder API
triggers
  .for('modelName')           // Your Prisma model (auto-completed!)
  .withName('my_trigger')      // Optional: custom name
  .before() / .after()         // Timing
  .on('INSERT', 'UPDATE')      // Events to watch
  .watchColumns('col1', 'col2') // Optional: specific columns
  .when(condition)             // Optional: conditions
  .notify('channel')           // Send notifications
  .build();
```

### 🎯 Condition Builder

```typescript
// Type-safe field comparisons
.when((c) => c.NEW('status').eq('active'))
.when((c) => c.NEW('price').gt(100))
.when((c) => c.OLD('email').ne(c.NEW('email')))

// Boolean logic
.when((c) => c.and(
  c.NEW('status').eq('published'),
  c.NEW('visibility').eq('public')
))

// Check if field changed
.when((c) => c.changed('status'))

// Raw SQL (escape hatch)
.when('NEW.price > 1000 AND NEW.currency = \'USD\'')
```

### 📡 Notification Handling

```typescript
// Single trigger
trigger.subscribe((event) => {
  console.log(event.operation);  // 'INSERT' | 'UPDATE' | 'DELETE'
  console.log(event.timestamp);   // When it happened
  console.log(event.data);        // Your typed model data
});

// Registry pattern
registry.on('channel', (event) => {
  // Same event structure, fully typed!
});
```

### 🎮 Lifecycle Management

```typescript
// Individual triggers
await trigger.setup();    // Create in database
await trigger.listen();   // Start listening
await trigger.stop();     // Stop listening
await trigger.drop();     // Remove from database

// Registry
await registry.setup();   // Set up all triggers
await registry.listen();  // Start all listeners
await registry.stop();    // Stop all listeners
await registry.drop();    // Clean up everything
```

## 💡 Common Patterns

### Audit Logging
```typescript
triggers
  .for('user')
  .after()
  .on('UPDATE')
  .when((c) => c.changed('email'))
  .notify('audit_log')
  .build();
```

### Status Workflows
```typescript
triggers
  .for('order')
  .after()
  .on('UPDATE')
  .when((c) => c.and(
    c.OLD('status').eq('pending'),
    c.NEW('status').eq('confirmed')
  ))
  .notify('order_confirmed')
  .build();
```

### Real-time Updates
```typescript
triggers
  .for('message')
  .after()
  .on('INSERT')
  .notify('new_messages')
  .build();
```

## 🚨 Troubleshooting

### "Could not access Prisma DMMF"
This warning appears when using Prisma with adapters. Your triggers will still work correctly! The library falls back to smart defaults.

### Notifications not received?
1. Check your PostgreSQL logs for errors
2. Ensure your database user has TRIGGER privileges
3. Verify the channel names match between trigger and listener
4. Try running `SELECT * FROM pg_trigger` to see if triggers were created

### Type errors?
Make sure you're passing your Prisma client type correctly:
```typescript
const triggers = createTriggers<typeof prisma>(DATABASE_URL);
//                              ^^^^^^^^^^^^^^ This is important!
```

## 🤝 Contributing

We'd love your help making this library even better! 

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`bun test`)
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Development Setup

```bash
# Clone and install
git clone https://github.com/bewinxed/pg-typesafe-triggers.git
cd pg-typesafe-triggers
bun install

# Run tests
bun test

# Build
bun run build
```

## 📄 License

MIT © [bewinxed](https://github.com/bewinxed)

---

<p align="center">
  Made with 💜 by developers who were tired of writing PostgreSQL trigger syntax
  <br>
  <br>
  If this library helped you, consider giving it a ⭐️
  <br>
  <br>
  <a href="https://github.com/bewinxed/pg-typesafe-triggers/issues">Report Bug</a>
  ·
  <a href="https://github.com/bewinxed/pg-typesafe-triggers/issues">Request Feature</a>
  ·
  <a href="https://github.com/bewinxed/pg-typesafe-triggers/discussions">Join Discussion</a>
</p>