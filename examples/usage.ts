// examples/improved-usage.ts
import { PrismaClient } from '@prisma/client';
import {
  EventDrivenTriggerManager,
  AuditLogPlugin,
  MetricsPlugin,
  TriggerPlugin
} from '../src/core/event-driven-manager';

// Custom plugin for rate limiting notifications
class RateLimitPlugin implements TriggerPlugin {
  name = 'rate-limit';
  version = '1.0.0';

  private rateLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(private limit: number = 100, private windowMs: number = 60000) {}

  async beforeNotification(channel: string, payload: any): Promise<any> {
    const now = Date.now();
    const limit = this.rateLimits.get(channel);

    if (!limit || now > limit.resetAt) {
      this.rateLimits.set(channel, { count: 1, resetAt: now + this.windowMs });
      return payload;
    }

    if (limit.count >= this.limit) {
      throw new Error(`Rate limit exceeded for channel: ${channel}`);
    }

    limit.count++;
    return payload;
  }
}

async function main() {
  // Initialize with plugins and monitoring
  const triggers = new EventDrivenTriggerManager<PrismaClient>(
    process.env.DATABASE_URL!,
    {
      autoCleanup: true,
      metricsInterval: 30000, // Collect metrics every 30s
      plugins: [
        new AuditLogPlugin(),
        new MetricsPlugin(),
        new RateLimitPlugin(1000, 60000) // 1000 notifications per minute
      ]
    }
  );

  // Set up monitoring
  triggers.on('error', ({ error, context }) => {
    console.error(`Error in ${context}:`, error);
  });

  triggers.on('metrics:snapshot', (metrics) => {
    console.log('Metrics:', {
      channels: metrics.channels,
      handlers: metrics.handlers,
      notifications: metrics.notifications,
      memory: `${Math.round(metrics.memory.heapUsed / 1024 / 1024)}MB`
    });
  });

  // Example 1: Type-safe trigger creation with compile-time validation
  const itemStatusTrigger = await triggers
    .create()
    .for('item') // ✅ Only valid model names allowed
    .withName('item_status_change')
    .after() // ✅ Must set timing after name
    .on('UPDATE') // ✅ Must set events after timing
    .when(
      (
        { NEW, OLD } // ✅ NEW and OLD are fully typed
      ) => NEW.status !== OLD.status
    )
    .watchColumns('status', 'listId') // ✅ Only valid columns allowed
    .notify('item_status_changes')
    .build();

  // Example 2: Batch processing for high-frequency updates
  const orderTrigger = await triggers
    .create()
    .for('item')
    .withName('order_updates')
    .after()
    .on('INSERT', 'UPDATE')
    .when(({ OLD, NEW }) => NEW.status !== OLD.status)
    .notify('order_events')
    .build();

  // Subscribe with automatic resource cleanup
  await triggers.subscribe<Order>('order_events', async (payload) => {
    // Process order update
    console.log(`Order ${payload.data.id}: ${payload.operation}`);
  });

  // Example 3: Migration management
  const migrationHelper = triggers.migrations();

  // Introspect current triggers
  const currentTriggers = await migrationHelper.introspect();
  console.log(`Found ${currentTriggers.length} existing triggers`);

  // Generate migration SQL
  const migration = await migrationHelper.generateMigration([
    {
      modelName: 'item',
      tableName: 'Item',
      triggerName: 'item_audit',
      timing: 'AFTER',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      functionName: 'audit_logger'
    }
  ]);

  console.log('Migration UP:', migration.up);
  console.log('Migration DOWN:', migration.down);

  // Example 4: Transaction safety
  await triggers.transaction(async (tx) => {
    // All operations in this block are transactional
    await tx`CREATE TABLE audit_log (id SERIAL PRIMARY KEY, data JSONB)`;
    await tx`CREATE FUNCTION audit_logger() RETURNS TRIGGER AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql`;
    // If any operation fails, everything is rolled back
  });

  // Example 5: Component lifecycle management
  const component = {
    triggers,
    cleanup: async () => {
      // Unsubscribe handlers associated with this component
      await triggers.dispose();
    }
  };

  // Automatic cleanup on component unmount
  process.on('beforeExit', () => component.cleanup());

  // Example 6: Error boundaries and recovery
  triggers.on('handler:error', async ({ channel, error }) => {
    console.error(`Handler error on ${channel}:`, error);

    // Implement circuit breaker pattern
    if (error.message.includes('database')) {
      console.log('Database error detected, pausing subscriptions...');
      // Implement backoff strategy
    }
  });

  // Example 7: Development tools
  if (process.env.NODE_ENV === 'development') {
    // Enable verbose logging
    triggers.on('notification:received', ({ channel, payload }) => {
      console.debug(`[DEV] Notification on ${channel}:`, payload);
    });

    // Track performance
    triggers.on('notification:processed', ({ channel, duration, success }) => {
      if (duration > 100) {
        console.warn(`[PERF] Slow handler on ${channel}: ${duration}ms`);
      }
    });
  }

  console.log('Trigger system initialized and monitoring...');
}

// Type definitions for better DX
interface Order {
  id: string;
  customerId: string;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
}

main().catch(console.error);
