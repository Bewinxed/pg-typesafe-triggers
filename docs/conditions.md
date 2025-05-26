# Conditions

Build complex trigger conditions with type safety.

## Basic Comparisons

```typescript
.when(c => c.NEW('status').eq('active'))      // equals
.when(c => c.NEW('price').gt(100))            // greater than
.when(c => c.NEW('stock').gte(10))            // greater or equal
.when(c => c.NEW('discount').lt(50))          // less than
.when(c => c.NEW('quantity').lte(5))          // less or equal
.when(c => c.NEW('email').ne('old@mail.com')) // not equal
```

## Field Comparisons

```typescript
// Compare OLD vs NEW
.when(c => c.OLD('email').ne(c.NEW('email')))

// Check if changed
.when(c => c.changed('status'))
.when(c => c.changed('email', 'phone'))  // Any of these changed
```

## Null Checks

```typescript
.when(c => c.NEW('deletedAt').isNull())
.when(c => c.NEW('approvedBy').isNotNull())
```

## Boolean Logic

```typescript
// AND
.when(c => c.and(
  c.NEW('status').eq('published'),
  c.NEW('visibility').eq('public')
))

// OR
.when(c => c.or(
  c.NEW('priority').eq('high'),
  c.NEW('deadline').lt(new Date())
))

// NOT
.when(c => c.not(c.NEW('archived').eq(true)))
```

## Complex Conditions

```typescript
// Nested logic
.when(c => c.and(
  c.changed('status'),
  c.or(
    c.and(
      c.OLD('status').eq('draft'),
      c.NEW('status').eq('published')
    ),
    c.and(
      c.OLD('status').eq('published'),
      c.NEW('status').eq('archived')
    )
  )
))
```

## Pattern Matching

```typescript
// LIKE
.when(c => c.NEW('email').like('%@company.com'))

// IN
.when(c => c.NEW('status').in(['active', 'pending', 'processing']))

// BETWEEN
.when(c => c.NEW('age').between(18, 65))
```

## Real-World Examples

### Order Status Workflow

```typescript
triggers
  .for('order')
  .after()
  .on('UPDATE')
  .when(c => c.and(
    c.changed('status'),
    c.OLD('status').eq('payment_pending'),
    c.NEW('status').eq('payment_confirmed'),
    c.NEW('amount').gt(0)
  ))
  .notify('order_paid')
  .build();
```

### User Account Changes

```typescript
triggers
  .for('user')
  .after()
  .on('UPDATE')
  .when(c => c.or(
    c.changed('email'),
    c.changed('password'),
    c.changed('twoFactorEnabled')
  ))
  .notify('security_change')
  .build();
```

### Inventory Alerts

```typescript
triggers
  .for('product')
  .after()
  .on('UPDATE')
  .when(c => c.and(
    c.NEW('stock').lt(10),
    c.OLD('stock').gte(10),
    c.NEW('active').eq(true)
  ))
  .notify('low_stock_alert')
  .build();
```

## Raw SQL Escape Hatch

```typescript
// For complex conditions not supported by the builder
.when('NEW.data::jsonb @> \'{"featured": true}\'::jsonb')
```

## Next: [Real-time Events](./realtime-events.md)