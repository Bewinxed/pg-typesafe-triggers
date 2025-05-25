// examples/usage.ts
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
// 2. ENHANCED REGISTRY WITH SPECIFIC TRIGGERS
// ============================================

async function enhancedRegistryExample() {
  // Create a registry with specific, named triggers
  const registry = triggers
    .registry()
    // Item-specific triggers
    .define('item_created', {
      model: 'item',
      events: ['INSERT'],
      timing: 'AFTER',
      forEach: 'ROW',
      notify: 'item_created'
    })
    .define('item_status_changed', {
      model: 'item',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) => c.changed('status'),
      notify: 'item_status_updates'
    })
    .define('item_completed', {
      model: 'item',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) =>
        c.and(c.OLD('status').ne('COMPLETED'), c.NEW('status').eq('COMPLETED')),
      notify: 'item_completions'
    })
    .define('high_priority_items', {
      model: 'item',
      events: ['INSERT', 'UPDATE'],
      timing: 'AFTER',
      when: (c) => c.NEW('priority').gte(4),
      notify: 'priority_alerts'
    })
    // User-specific triggers
    .define('user_signup', {
      model: 'user',
      events: ['INSERT'],
      timing: 'AFTER',
      notify: 'new_users'
    })
    .define('user_email_changed', {
      model: 'user',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) => c.changed('email'),
      notify: 'email_changes'
    })
    .define('user_deactivated', {
      model: 'user',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) => c.and(c.OLD('active').eq(true), c.NEW('active').eq(false)),
      notify: 'user_deactivations'
    })
    // List-specific triggers
    .define('list_item_count_changed', {
      model: 'list',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) => c.changed('itemCount'),
      notify: 'list_updates'
    });

  // Set up all triggers
  await registry.setup();
  await registry.listen();

  // Now you can listen to SPECIFIC triggers by their ID!
  registry.on('item_created', (event) => {
    console.log(`New item created: ${event.data.name}`);
    // Send welcome email, initialize related data, etc.
  });

  registry.on('item_status_changed', (event) => {
    console.log(`Item ${event.data.id} status: ${event.data.status}`);
    // Update related systems, send notifications
  });

  registry.on('item_completed', async (event) => {
    console.log(`Item completed: ${event.data.name}`);
    // Update metrics, send completion notification
    await updateCompletionMetrics(event.data);
    await notifyAssignee(event.data);
  });

  registry.on('high_priority_items', async (event) => {
    console.log(`HIGH PRIORITY: ${event.data.name} (P${event.data.priority})`);
    // Page on-call, send urgent notifications
    await pageOnCall(event.data);
  });

  registry.on('user_signup', async (event) => {
    console.log(`Welcome new user: ${event.data.email}`);
    await sendWelcomeEmail(event.data);
    await createUserDefaults(event.data);
  });

  // You can still listen to ALL events for a model if needed
  registry.onModel('item', (event) => {
    console.log(`Any item event: ${event.operation} on ${event.data.id}`);
    // Log all item changes for audit trail
  });

  // Get all trigger IDs (useful for debugging/monitoring)
  const triggerIds = registry.getTriggerIds();
  console.log('Registered triggers:', triggerIds);
}

// ============================================
// 3. BUSINESS LOGIC EXAMPLE
// ============================================

async function businessLogicExample() {
  const registry = triggers
    .registry()
    // Item lifecycle
    .define('item_created', {
      model: 'item',
      events: ['INSERT'],
      timing: 'AFTER',
      notify: 'item_created'
    })
    .define('item_assigned', {
      model: 'item',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) =>
        c.and(c.OLD('assigneeId').isNull(), c.NEW('assigneeId').isNotNull()),
      notify: 'item_assigned'
    })
    .define('item_priority_raised', {
      model: 'item',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) => c.NEW('priority').gt(c.OLD('priority')),
      notify: 'priority_raised'
    })
    .define('item_overdue', {
      model: 'item',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) =>
        c.and(c.NEW('dueDate').lt(new Date()), c.NEW('status').ne('COMPLETED')),
      notify: 'item_overdue'
    })
    // List management
    .define('list_archived', {
      model: 'list',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) =>
        c.and(c.OLD('archivedAt').isNull(), c.NEW('archivedAt').isNotNull()),
      notify: 'list_archived'
    })
    .define('list_published', {
      model: 'list',
      events: ['UPDATE'],
      timing: 'AFTER',
      when: (c) =>
        c.and(c.OLD('isPublic').eq(false), c.NEW('isPublic').eq(true)),
      notify: 'list_published'
    });

  await registry.setup();
  await registry.listen();

  // Item handlers
  registry.on('item_created', async (event) => {
    await createActivity(event.data, 'CREATED');
    await updateListItemCount(event.data.listId);
  });

  registry.on('item_assigned', async (event) => {
    await notifyAssignee(event.data);
    await createActivity(event.data, 'ASSIGNED');
  });

  registry.on('item_priority_raised', async (event) => {
    if (event.data.priority >= 4) {
      await sendUrgentNotification(event.data);
    }
  });

  // List handlers
  registry.on('list_archived', async (event) => {
    await archiveAllItems(event.data.id);
    await notifyListOwner(event.data);
  });

  registry.on('list_published', async (event) => {
    await indexForSearch(event.data);
    await notifySubscribers(event.data);
  });
}

// ============================================
// 4. WATCH SPECIFIC CHANGES
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
// 5. REAL-TIME UPDATES
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
// 6. AUDIT LOGGING
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
// 7. BUSINESS RULES
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

// Utility types for examples
declare const websocket: {
  broadcast(channel: string, data: any): Promise<void>;
};

// Mock functions for examples
async function updateCompletionMetrics(item: any) {}
async function notifyAssignee(item: any) {}
async function pageOnCall(item: any) {}
async function sendWelcomeEmail(user: any) {}
async function createUserDefaults(user: any) {}
async function createActivity(entity: any, type: string) {}
async function updateListItemCount(listId: string) {}
async function sendUrgentNotification(item: any) {}
async function archiveAllItems(listId: string) {}
async function notifyListOwner(list: any) {}
async function indexForSearch(list: any) {}
async function notifySubscribers(list: any) {}

export {
  simplestExample,
  enhancedRegistryExample,
  businessLogicExample,
  watchSpecificChanges,
  realtimeUpdates,
  auditLogging,
  businessRules
};
