// examples/quick-start.ts
import { PrismaClient } from '@prisma/client';
import { createTriggers } from '../src';

const prisma = new PrismaClient();
const triggers = createTriggers<typeof prisma>(process.env.DATABASE_URL!);

// ============================================
// 1. SIMPLEST EXAMPLE - Notify on changes
// ============================================

async function simplestExample() {
  // Create a trigger that notifies when items change
  const itemTrigger = triggers
    .for('item')
    .withName('item_changes')
    .after()
    .on('INSERT', 'UPDATE', 'DELETE')
    .notify('item_events')
    .build();

  // Set it up in the database
  await itemTrigger.setup();

  // Start listening for notifications
  await itemTrigger.listen();

  // Handle the notifications
  itemTrigger.subscribe((event) => {
    console.log(`Item ${event.operation}:`, event.data);
    // event.data is fully typed as Item!
  });
}

// ============================================
// 2. WATCH SPECIFIC CHANGES
// ============================================

async function watchSpecificChanges() {
  // Only trigger when status changes
  const statusTrigger = triggers
    .for('item')
    .withName('status_watcher')
    .after()
    .on('UPDATE')
    .watchColumns('status') // Only fires when status changes
    .notify('status_changes')
    .build();

  await statusTrigger.setup();
  await statusTrigger.listen();

  statusTrigger.subscribe((event) => {
    console.log(`Status changed to: ${event.data.status}`);
  });

  // Only trigger when item is completed
  const completionTrigger = triggers
    .for('item')
    .withName('completion_tracker')
    .after()
    .on('UPDATE')
    .when(
      ({ NEW, OLD }) => NEW.status === 'COMPLETED' && OLD.status !== 'COMPLETED'
    )
    .notify('completions')
    .build();

  await completionTrigger.setup();
  await completionTrigger.listen();

  completionTrigger.subscribe((event) => {
    console.log(`Item completed: ${event.data.name}`);
  });
}

// ============================================
// 3. REAL-TIME UPDATES
// ============================================

async function realtimeUpdates() {
  const realtimeTrigger = triggers
    .for('item')
    .withName('realtime_items')
    .after()
    .on('INSERT', 'UPDATE')
    .notify('item_updates')
    .build();

  await realtimeTrigger.setup();
  await realtimeTrigger.listen();

  // Connect to your WebSocket server
  realtimeTrigger.subscribe(async (event) => {
    // Broadcast to all connected clients
    await websocket.broadcast('item-updates', {
      operation: event.operation,
      item: event.data,
      timestamp: event.timestamp
    });
  });
}

// ============================================
// 4. AUDIT LOGGING
// ============================================

async function auditLogging() {
  // First, create an audit function in the database
  await triggers.transaction(async (tx) => {
    await tx`
      CREATE OR REPLACE FUNCTION audit_changes()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO "Activity" (
          "type", 
          "entityType", 
          "entityId", 
          "userId",
          "changes"
        ) VALUES (
          TG_OP,
          TG_TABLE_NAME,
          COALESCE(NEW."id", OLD."id"),
          current_setting('app.current_user_id', true)::uuid,
          to_jsonb(COALESCE(NEW, OLD))
        );
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `;
  });

  // Then create triggers that use it
  const auditTrigger = triggers
    .for('item')
    .withName('item_audit')
    .after()
    .on('INSERT', 'UPDATE', 'DELETE')
    .executeFunction('audit_changes')
    .build();

  await auditTrigger.setup();
}

// ============================================
// 5. BUSINESS RULES
// ============================================

async function businessRules() {
  // Prevent deletion of lists with active items
  await triggers.transaction(async (tx) => {
    await tx`
      CREATE OR REPLACE FUNCTION prevent_list_deletion()
      RETURNS TRIGGER AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "Item" 
          WHERE "listId" = OLD."id" 
          AND "status" != 'COMPLETED'
        ) THEN
          RAISE EXCEPTION 'Cannot delete list with active items';
        END IF;
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `;
  });

  const preventDeleteTrigger = triggers
    .for('list')
    .withName('prevent_list_delete')
    .before() // BEFORE trigger can prevent the operation
    .on('DELETE')
    .executeFunction('prevent_list_deletion')
    .build();

  await preventDeleteTrigger.setup();
}

// ============================================
// 6. MANAGE MULTIPLE TRIGGERS
// ============================================

async function multipleTriggersWithRegistry() {
  // Set up multiple triggers at once
  const registry = triggers
    .registry()
    .add('user', {
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'notify_user_changes',
      notify: 'user_events'
    })
    .add('list', {
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'notify_list_changes',
      notify: 'list_events'
    })
    .add('item', {
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'notify_item_changes',
      notify: 'item_events'
    });

  // Set up all triggers
  await registry.setup();
  await registry.listen();

  // Handle events for each model
  registry.on('user', (event) => {
    console.log('User event:', event.operation, event.data.email);
  });

  registry.on('list', (event) => {
    console.log('List event:', event.operation, event.data.name);
  });

  registry.on('item', (event) => {
    console.log('Item event:', event.operation, event.data.name);
  });
}

// ============================================
// COMMON PATTERNS
// ============================================

async function commonPatterns() {
  // 1. Soft delete cascade
  const softDeleteCascade = triggers
    .for('user')
    .withName('soft_delete_cascade')
    .after()
    .on('UPDATE')
    .when(({ NEW, OLD }) => OLD.deletedAt === null && NEW.deletedAt !== null)
    .notify('user_soft_deleted')
    .build();

  // 2. Update timestamps
  const updateTimestamp = triggers
    .for('item')
    .withName('update_timestamp')
    .before()
    .on('UPDATE')
    .executeFunction('update_modified_time')
    .build();

  // 3. Maintain counts
  const maintainCounts = triggers
    .for('item')
    .withName('maintain_list_counts')
    .after()
    .on('INSERT', 'DELETE')
    .executeFunction('update_list_item_count')
    .build();

  // 4. Send notifications
  const sendNotifications = triggers
    .for('item')
    .withName('high_priority_notifications')
    .after()
    .on('INSERT', 'UPDATE')
    .when(({ NEW }) => NEW.priority >= 4)
    .notify('high_priority_items')
    .build();

  // Set them all up
  await Promise.all([
    softDeleteCascade.setup(),
    updateTimestamp.setup(),
    maintainCounts.setup(),
    sendNotifications.setup()
  ]);
}

// Utility types for examples
declare const websocket: {
  broadcast(channel: string, data: any): Promise<void>;
};

export {
  simplestExample,
  watchSpecificChanges,
  realtimeUpdates,
  auditLogging,
  businessRules,
  multipleTriggersWithRegistry,
  commonPatterns
};
