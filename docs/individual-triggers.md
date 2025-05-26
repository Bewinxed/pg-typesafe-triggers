# Individual Triggers

Create and manage single triggers with fine-grained control.

## Basic Trigger

```typescript
const trigger = triggers
  .for('user')
  .after()
  .on('INSERT')
  .notify('new_user')
  .build();

await trigger.setup();
```

## Trigger Options

### Timing

```typescript
.before()  // Run before the operation
.after()   // Run after the operation
```

### Events

```typescript
.on('INSERT')
.on('UPDATE')
.on('DELETE')
.on('INSERT', 'UPDATE')  // Multiple events
```

### Column Watching

```typescript
.watchColumns('email', 'status')  // Only trigger on specific column changes
```

### Custom Names

```typescript
.withName('user_email_change_trigger')
```

## Complete Example

```typescript
const emailChangeTrigger = triggers
  .for('user')
  .withName('track_email_changes')
  .after()
  .on('UPDATE')
  .watchColumns('email')
  .when(c => c.OLD('email').ne(c.NEW('email')))
  .notify('user_email_changed')
  .build();

// Deploy
await emailChangeTrigger.setup();
await emailChangeTrigger.listen();

// Handle events
emailChangeTrigger.subscribe((event) => {
  console.log(`Email changed from ${event.old.email} to ${event.data.email}`);
});
```

## Lifecycle Methods

```typescript
await trigger.setup();   // Create in database
await trigger.listen();  // Start listening for events
await trigger.stop();    // Stop listening
await trigger.drop();    // Remove from database
```

## When to Use

- Single, specific business logic
- Testing individual triggers
- Gradual migration from SQL triggers
- Simple notification needs

## Next: [Registry Pattern](./registry-pattern.md)