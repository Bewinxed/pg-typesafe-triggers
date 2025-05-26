# Registry Pattern

Manage multiple triggers across your application from a single place.

## Basic Registry

```typescript
const registry = triggers.registry();

registry
  .add('user', {
    events: ['INSERT', 'UPDATE'],
    timing: 'AFTER',
    notify: 'user_changes'
  })
  .add('order', {
    events: ['INSERT'],
    timing: 'AFTER',
    notify: 'new_orders'
  });

await registry.setup();
await registry.listen();
```

## Registry Options

### Full Configuration

```typescript
registry.add('modelName', {
  events: ['INSERT', 'UPDATE', 'DELETE'],
  timing: 'AFTER',              // or 'BEFORE'
  forEach: 'ROW',               // or 'STATEMENT'
  watchColumns: ['col1', 'col2'],
  when: (c) => c.NEW('status').eq('active'),
  notify: 'channel_name'
});
```

### Conditional Triggers

```typescript
registry.add('order', {
  events: ['UPDATE'],
  timing: 'AFTER',
  when: (c) => c.and(
    c.OLD('status').eq('pending'),
    c.NEW('status').eq('confirmed')
  ),
  notify: 'order_confirmed'
});
```

## Event Handling

```typescript
// Subscribe to specific models
registry.on('user', (event) => {
  console.log(`User ${event.operation}: ${event.data.email}`);
});

// Subscribe to custom channels
registry.on('order_confirmed', (event) => {
  sendConfirmationEmail(event.data);
});
```

## Complete Example

```typescript
const registry = triggers.registry();

// Define all triggers
registry
  .add('user', {
    events: ['INSERT'],
    timing: 'AFTER',
    notify: 'new_users'
  })
  .add('user', {
    events: ['UPDATE'],
    timing: 'AFTER',
    watchColumns: ['email'],
    notify: 'email_changes'
  })
  .add('order', {
    events: ['INSERT', 'UPDATE'],
    timing: 'AFTER',
    notify: 'order_activity'
  })
  .add('payment', {
    events: ['INSERT'],
    timing: 'AFTER',
    when: (c) => c.NEW('status').eq('completed'),
    notify: 'successful_payments'
  });

// Deploy all at once
await registry.setup();
await registry.listen();

// Handle events
registry.on('new_users', async (event) => {
  await sendWelcomeEmail(event.data.email);
});

registry.on('successful_payments', async (event) => {
  await updateInventory(event.data.orderId);
  await notifyWarehouse(event.data);
});
```

## Lifecycle Management

```typescript
await registry.setup();   // Create all triggers
await registry.listen();  // Start all listeners
await registry.stop();    // Stop all listeners
await registry.drop();    // Remove all triggers
```

## When to Use

- Managing multiple triggers
- Application-wide event handling
- Centralized trigger configuration
- Complex multi-model workflows

## Next: [Conditions](./conditions.md)