# pg-typesafe-triggers

Type-safe PostgreSQL triggers for Prisma without writing SQL.

## What it does

Automatically creates PostgreSQL trigger functions from TypeScript code. Full type safety using your Prisma schema types.

## Quick Example

```typescript
// Instead of writing SQL...
triggers
  .for('order')
  .after()
  .on('UPDATE')
  .when(c => c.NEW('status').eq('shipped'))
  .notify('order_shipped')
  .build();

// Automatically generates and manages the PostgreSQL trigger
```

## Use Cases

- [Individual Triggers](./individual-triggers.md) - Fine control over single triggers
- [Registry Pattern](./registry-pattern.md) - Manage multiple triggers at once
- [Conditions](./conditions.md) - Complex trigger logic
- [Real-time Events](./realtime-events.md) - Subscribe to database changes
- [Common Patterns](./patterns.md) - Audit logs, workflows, sync

## Installation

```bash
npm install pg-typesafe-triggers
```

## Basic Setup

```typescript
import { createTriggers } from 'pg-typesafe-triggers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const triggers = createTriggers<typeof prisma>(DATABASE_URL);
```

## Next Steps

Choose your approach:
- [Individual Triggers](./individual-triggers.md) for specific use cases
- [Registry Pattern](./registry-pattern.md) for managing many triggers