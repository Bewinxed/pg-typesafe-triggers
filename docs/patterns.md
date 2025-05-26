# Common Patterns

Ready-to-use trigger patterns for common scenarios.

## Audit Logging

Track all changes to sensitive models.

```typescript
const auditTrigger = triggers
  .for('user')
  .after()
  .on('INSERT', 'UPDATE', 'DELETE')
  .notify('audit_log')
  .build();

auditTrigger.subscribe(async (event) => {
  await prisma.auditLog.create({
    data: {
      tableName: 'user',
      operation: event.operation,
      userId: getCurrentUserId(),
      timestamp: event.timestamp,
      oldData: event.old ? JSON.stringify(event.old) : null,
      newData: event.data ? JSON.stringify(event.data) : null,
      changedFields: event.columns
    }
  });
});
```

## Soft Delete Cascade

Automatically cascade soft deletes.

```typescript
triggers
  .for('company')
  .after()
  .on('UPDATE')
  .when(c => c.and(
    c.OLD('deletedAt').isNull(),
    c.NEW('deletedAt').isNotNull()
  ))
  .notify('company_soft_deleted')
  .build();

trigger.subscribe(async (event) => {
  // Soft delete related records
  await prisma.employee.updateMany({
    where: { companyId: event.data.id },
    data: { deletedAt: event.data.deletedAt }
  });
});
```

## Email Notifications

Send emails on specific events.

```typescript
registry
  .add('order', {
    events: ['UPDATE'],
    timing: 'AFTER',
    when: c => c.and(
      c.changed('status'),
      c.NEW('status').eq('shipped')
    ),
    notify: 'order_shipped'
  })
  .add('user', {
    events: ['INSERT'],
    timing: 'AFTER',
    notify: 'welcome_email'
  });

registry.on('order_shipped', async (event) => {
  await emailService.send({
    to: event.data.customerEmail,
    template: 'order-shipped',
    data: {
      orderNumber: event.data.number,
      trackingNumber: event.data.trackingNumber
    }
  });
});

registry.on('welcome_email', async (event) => {
  await emailService.send({
    to: event.data.email,
    template: 'welcome',
    data: { name: event.data.name }
  });
});
```

## Data Synchronization

Keep denormalized data in sync.

```typescript
triggers
  .for('product')
  .after()
  .on('UPDATE')
  .watchColumns('name', 'price')
  .notify('product_sync')
  .build();

trigger.subscribe(async (event) => {
  // Update denormalized data in orders
  await prisma.orderItem.updateMany({
    where: { productId: event.data.id },
    data: {
      productName: event.data.name,
      productPrice: event.data.price
    }
  });
});
```

## Status Workflows

Implement state machines.

```typescript
const orderStateMachine = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: []
};

triggers
  .for('order')
  .before()
  .on('UPDATE')
  .when(c => c.changed('status'))
  .notify('order_status_validation')
  .build();

trigger.subscribe(async (event) => {
  const oldStatus = event.old?.status;
  const newStatus = event.data.status;
  
  const allowedTransitions = orderStateMachine[oldStatus] || [];
  
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(`Invalid status transition: ${oldStatus} -> ${newStatus}`);
  }
});
```

## Search Index Updates

Keep search indexes fresh.

```typescript
registry
  .add('product', {
    events: ['INSERT', 'UPDATE', 'DELETE'],
    timing: 'AFTER',
    notify: 'search_index'
  })
  .add('category', {
    events: ['UPDATE'],
    timing: 'AFTER',
    watchColumns: ['name', 'description'],
    notify: 'search_index'
  });

registry.on('search_index', async (event) => {
  switch (event.operation) {
    case 'INSERT':
    case 'UPDATE':
      await searchService.index(event.data);
      break;
    case 'DELETE':
      await searchService.remove(event.old?.id);
      break;
  }
});
```

## Computed Fields

Auto-calculate derived values.

```typescript
triggers
  .for('orderItem')
  .before()
  .on('INSERT', 'UPDATE')
  .notify('calculate_totals')
  .build();

trigger.subscribe(async (event) => {
  // Auto-calculate line total
  const total = event.data.quantity * event.data.unitPrice;
  
  if (event.data.total !== total) {
    await prisma.orderItem.update({
      where: { id: event.data.id },
      data: { total }
    });
  }
});
```

## Rate Limiting

Prevent abuse with triggers.

```typescript
triggers
  .for('apiCall')
  .before()
  .on('INSERT')
  .notify('rate_limit_check')
  .build();

trigger.subscribe(async (event) => {
  const recentCalls = await prisma.apiCall.count({
    where: {
      userId: event.data.userId,
      createdAt: {
        gte: new Date(Date.now() - 60000) // Last minute
      }
    }
  });
  
  if (recentCalls >= 100) {
    throw new Error('Rate limit exceeded');
  }
});
```