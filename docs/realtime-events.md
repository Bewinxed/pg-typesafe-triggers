# Real-time Events

Subscribe to database changes as they happen.

## Event Structure

```typescript
interface TriggerEvent<T> {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  timestamp: Date;
  data: T;        // New data (current state)
  old?: T;        // Old data (UPDATE/DELETE only)
  columns?: string[];  // Changed columns (UPDATE only)
}
```

## Individual Trigger Events

```typescript
const trigger = triggers
  .for('message')
  .after()
  .on('INSERT')
  .notify('new_messages')
  .build();

await trigger.setup();
await trigger.listen();

// Subscribe
trigger.subscribe((event) => {
  console.log(`New message: ${event.data.content}`);
  broadcastToUser(event.data.userId, event.data);
});
```

## Registry Events

```typescript
const registry = triggers.registry();

registry.add('notification', {
  events: ['INSERT'],
  timing: 'AFTER',
  notify: 'notifications'
});

await registry.setup();
await registry.listen();

// Subscribe by model name
registry.on('notification', (event) => {
  sendPushNotification(event.data);
});
```

## Multiple Subscriptions

```typescript
// Multiple handlers for same event
trigger.subscribe(handler1);
trigger.subscribe(handler2);
trigger.subscribe(handler3);

// Unsubscribe specific handler
const unsubscribe = trigger.subscribe(handler);
unsubscribe(); // Remove this handler
```

## Event Examples

### INSERT Event

```typescript
registry.on('user', (event) => {
  if (event.operation === 'INSERT') {
    console.log('New user:', event.data.email);
    // event.old is undefined for INSERT
  }
});
```

### UPDATE Event

```typescript
registry.on('order', (event) => {
  if (event.operation === 'UPDATE') {
    console.log('Old status:', event.old?.status);
    console.log('New status:', event.data.status);
    console.log('Changed fields:', event.columns);
  }
});
```

### DELETE Event

```typescript
registry.on('item', (event) => {
  if (event.operation === 'DELETE') {
    console.log('Deleted item:', event.old?.name);
    // event.data contains the deleted row
  }
});
```

## Real-world Use Cases

### Live Chat

```typescript
triggers
  .for('message')
  .after()
  .on('INSERT')
  .notify('chat_messages')
  .build();

trigger.subscribe((event) => {
  io.to(`room-${event.data.roomId}`).emit('new-message', {
    id: event.data.id,
    text: event.data.content,
    userId: event.data.userId,
    timestamp: event.timestamp
  });
});
```

### Activity Feed

```typescript
registry
  .add('post', {
    events: ['INSERT', 'UPDATE'],
    timing: 'AFTER',
    notify: 'feed_updates'
  })
  .add('comment', {
    events: ['INSERT'],
    timing: 'AFTER',
    notify: 'feed_updates'
  });

registry.on('feed_updates', (event) => {
  const activity = {
    type: event.operation,
    model: getModelType(event),
    data: event.data,
    timestamp: event.timestamp
  };
  
  broadcastToFollowers(activity);
});
```

### Cache Invalidation

```typescript
registry.add('product', {
  events: ['UPDATE', 'DELETE'],
  timing: 'AFTER',
  watchColumns: ['price', 'stock', 'name'],
  notify: 'product_changes'
});

registry.on('product_changes', (event) => {
  cache.delete(`product:${event.data.id}`);
  cache.delete(`category:${event.data.categoryId}:products`);
});
```

## Performance Tips

- Use `watchColumns` to limit notifications
- Add conditions to filter events at database level
- Batch process events when possible
- Consider debouncing for high-frequency updates

## Next: [Common Patterns](./patterns.md)