// tests/notification-registry.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { prisma, resetNotifications, pgClient } from './setup';
import { waitForCondition } from './utils';
import { TriggerEvent, Registry, createTriggers } from '../src';

describe('Notification Registry and Unified Subscription', () => {
  // Record received notifications for testing with unique channel names per test
  const testId = Math.random().toString(36).substring(7);
  const receivedNotifications: Record<string, any[]> = {};

  let registry: Registry<NonNullable<typeof prisma>, any> | null = null;
  let triggerManager: ReturnType<
    typeof createTriggers<NonNullable<typeof prisma>>
  > | null = null;
  let activeTriggerNames: string[] = [];

  // Setup triggers and registry before tests
  beforeEach(async () => {
    resetNotifications();

    // Clear out old data
    await prisma!.item.deleteMany({});
    await prisma!.list.deleteMany({});
    await prisma!.uwU.deleteMany({});

    // Clear our test notification recorder
    Object.keys(receivedNotifications).forEach((key) => {
      receivedNotifications[key] = [];
    });

    // Clean up any existing triggers before starting the test
    const tables = ['Item', 'List', 'uwu_table', 'User'];
    const allPossibleTriggers = [
      'item_registry_trigger',
      'list_registry_trigger',
      'uwU_registry_trigger',
      'item_special_trigger',
      'item_created_trigger',
      'item_status_changed_trigger',
      'item_completed_trigger',
      'trigger_one_trigger',
      'trigger_two_trigger',
      'trigger_three_trigger'
    ];

    for (const triggerName of allPossibleTriggers) {
      for (const table of tables) {
        try {
          await pgClient!.unsafe(
            `DROP TRIGGER IF EXISTS "${triggerName}" ON "${table}";`
          );
        } catch (error) {
          // Ignore errors if triggers don't exist
        }
      }
    }

    activeTriggerNames = [];
    registry = null;
    triggerManager = null;
  });

  // Clean up after each test
  afterEach(async () => {
    // Stop and drop registry first
    if (registry) {
      try {
        await registry.stop();
        await registry.drop();
      } catch (error) {
        console.warn('Error stopping registry:', error);
      }
    }

    // Dispose trigger manager
    if (triggerManager) {
      try {
        await triggerManager.dispose();
      } catch (error) {
        console.warn('Error disposing trigger manager:', error);
      }
      triggerManager = null;
    }

    // Clear state
    activeTriggerNames = [];
    registry = null;
  });

  test('should create a typed registry and subscribe to all channels', async () => {
    // Use unique channel names for this test
    const channels = {
      item: `item_events_${testId}_1`,
      list: `list_events_${testId}_1`,
      uwu: `uwu_events_${testId}_1`
    };

    // Initialize notification tracking
    receivedNotifications[channels.item] = [];
    receivedNotifications[channels.list] = [];
    receivedNotifications[channels.uwu] = [];

    // Create trigger manager
    triggerManager = createTriggers<NonNullable<typeof prisma>>(
      process.env.DATABASE_URL!
    );

    // Create a registry with channels for all three models
    registry = triggerManager.registry();

    // Add triggers for each model
    registry!.add('item', {
      name: 'item_registry_trigger',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'item_notify_func',
      notify: channels.item
    });

    registry!.add('list', {
      name: 'list_registry_trigger',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'list_notify_func',
      notify: channels.list
    });

    registry!.add('uwU', {
      name: 'uwU_registry_trigger',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'uwu_notify_func',
      notify: channels.uwu
    });

    activeTriggerNames = [
      'item_registry_trigger',
      'list_registry_trigger',
      'uwU_registry_trigger'
    ];

    // Set up handlers for all channels
    registry!.on(
      'item',
      (event: TriggerEvent<NonNullable<typeof prisma>, 'item', any>) => {
        receivedNotifications[channels.item].push(event);
      }
    );

    registry!.on(
      'list',
      (event: TriggerEvent<NonNullable<typeof prisma>, 'list', any>) => {
        receivedNotifications[channels.list].push(event);
      }
    );

    registry!.on(
      'uwU',
      (event: TriggerEvent<NonNullable<typeof prisma>, 'uwU', any>) => {
        receivedNotifications[channels.uwu].push(event);
      }
    );

    // Setup database and start listening
    await registry!.setup();
    await registry!.listen();

    // Wait for listeners to be fully established
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Perform database operations to trigger events

    // Create a user and list first
    const user = await prisma!.user.create({
      data: {
        email: `test-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}@example.com`,
        name: 'Test User'
      }
    });

    const list = await prisma!.list.create({
      data: {
        name: 'Test List',
        ownerId: user.id
      }
    });

    // Create items with list relation
    const item1 = await prisma!.item.create({
      data: {
        name: 'Test Item 1',
        status: 'PENDING',
        listId: list.id
      }
    });

    const item2 = await prisma!.item.create({
      data: {
        name: 'Test Item 2',
        status: 'PENDING',
        listId: list.id
      }
    });

    // Create a list with owner
    await prisma!.list.create({
      data: {
        name: 'Test List',
        owner: {
          create: {
            email: `test-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 11)}@example.com`,
            name: 'Test User'
          }
        }
      }
    });

    // Create a UwU
    const uwu = await prisma!.uwU.create({
      data: {
        what: 'Test UwU'
      }
    });

    // Update an item
    await prisma!.item.update({
      where: { id: item1.id },
      data: { status: 'COMPLETED' }
    });

    // Update a list
    await prisma!.list.update({
      where: { id: list.id },
      data: { name: 'Updated Test List' }
    });

    // Delete an item
    await prisma!.item.delete({
      where: { id: item2.id }
    });

    // Wait for all notifications to be received
    await Promise.all([
      waitForCondition(
        () => receivedNotifications[channels.item].length >= 4,
        5000
      ),
      waitForCondition(
        () => receivedNotifications[channels.list].length >= 2,
        5000
      ),
      waitForCondition(
        () => receivedNotifications[channels.uwu].length >= 1,
        5000
      )
    ]);

    // Add a small delay to ensure all notifications are processed
    await new Promise(resolve => setTimeout(resolve, 500));

    // Log received notifications for debugging
    console.log(`Item notifications received: ${receivedNotifications[channels.item].length}`);
    console.log('Item operations:', receivedNotifications[channels.item].map(n => n.operation));

    // Verify we got the correct number of notifications for each channel
    expect(receivedNotifications[channels.item].length).toBe(4);
    expect(receivedNotifications[channels.list].length).toBe(2);
    expect(receivedNotifications[channels.uwu].length).toBe(1);

    // Verify item notifications
    const itemInserts = receivedNotifications[channels.item].filter(
      (n) => n.operation === 'INSERT'
    );
    const itemUpdates = receivedNotifications[channels.item].filter(
      (n) => n.operation === 'UPDATE'
    );
    const itemDeletes = receivedNotifications[channels.item].filter(
      (n) => n.operation === 'DELETE'
    );

    expect(itemInserts.length).toBe(2);
    expect(itemUpdates.length).toBe(1);
    expect(itemDeletes.length).toBe(1);

    // Verify specific item data
    const updatedItem = itemUpdates[0];
    expect(updatedItem.data.id).toBe(item1.id);
    expect(updatedItem.data.status).toBe('COMPLETED');

    // Verify list notifications
    const listInserts = receivedNotifications[channels.list].filter(
      (n) => n.operation === 'INSERT'
    );
    const listUpdates = receivedNotifications[channels.list].filter(
      (n) => n.operation === 'UPDATE'
    );

    expect(listInserts.length).toBe(1);
    expect(listUpdates.length).toBe(1);

    // Verify specific list data
    const updatedList = listUpdates[0];
    expect(updatedList.data.id).toBe(list.id);
    expect(updatedList.data.name).toBe('Updated Test List');

    // Verify UwU notifications
    const uwuInserts = receivedNotifications[channels.uwu].filter(
      (n) => n.operation === 'INSERT'
    );
    expect(uwuInserts.length).toBe(1);
    expect(uwuInserts[0].data.id).toBe(uwu.id);
    expect(uwuInserts[0].data.what).toBe('Test UwU');
  });

  test('should support unsubscribe method for removing handlers', async () => {
    const channelName = `item_events_${testId}_2`;
    receivedNotifications[channelName] = [];

    // Create trigger manager
    triggerManager = createTriggers<NonNullable<typeof prisma>>(
      process.env.DATABASE_URL!
    );

    // Create a simple registry for this test
    registry = triggerManager.registry();
    registry!.add('item', {
      name: 'item_registry_trigger',
      events: ['INSERT'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'item_notify_func',
      notify: channelName
    });

    activeTriggerNames = ['item_registry_trigger'];

    let handlerCallCount = 0;
    const testHandler = (
      event: TriggerEvent<NonNullable<typeof prisma>, 'item', any>
    ) => {
      handlerCallCount++;
      receivedNotifications[channelName].push(event);
    };

    // Add the handler
    const unsubscribe = registry!.on('item', testHandler);

    // Setup and start listening
    await registry!.setup();
    await registry!.listen();

    // Create a list first
    const list = await prisma!.list.create({
      data: {
        name: 'Test List for Off',
        owner: {
          create: {
            email: `test-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 11)}@example.com`,
            name: 'Test User 2'
          }
        }
      }
    });

    // Create an item - should trigger handler
    await prisma!.item.create({
      data: {
        name: 'Test Item for Off',
        status: 'PENDING',
        listId: list.id
      }
    });

    await waitForCondition(
      () => receivedNotifications[channelName].length >= 1,
      2000
    );
    expect(receivedNotifications[channelName].length).toBe(1);
    expect(handlerCallCount).toBe(1);

    // Remove the handler using the unsubscribe function
    unsubscribe();

    // Reset counters
    handlerCallCount = 0;
    receivedNotifications[channelName] = [];

    // Create another item - should NOT trigger the removed handler
    await prisma!.item.create({
      data: {
        name: 'Test Item After Off',
        status: 'PENDING',
        listId: list.id
      }
    });

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify the handler was not called
    expect(handlerCallCount).toBe(0);
    expect(receivedNotifications[channelName].length).toBe(0);
  });

  test('should handle custom channels and triggers', async () => {
    // Create trigger manager
    triggerManager = createTriggers<NonNullable<typeof prisma>>(
      process.env.DATABASE_URL!
    );

    // Use a static channel name that matches what Registry expects
    const channelName = `special_events_${testId}`;
    receivedNotifications[channelName] = [];

    // Add a small delay to ensure previous test cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create a registry with a custom trigger
    registry = triggerManager.registry();

    // Add a model with a custom trigger that uses conditional logic
    registry!.add('item', {
      name: 'item_special_trigger',
      events: ['INSERT'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'special_notify_func',
      notify: channelName,
      when: (c) => c.NEW('name').like('Special%')
    });

    activeTriggerNames = ['item_special_trigger'];

    // Set up handler for custom trigger
    registry!.on(
      'item',
      (event: TriggerEvent<NonNullable<typeof prisma>, 'item', any>) => {
        console.log(
          '*** HANDLER CALLED ***',
          event.operation,
          event.data?.name
        );
        receivedNotifications[channelName].push(event);
      }
    );

    console.log('=== DEBUG INFO ===');
    console.log('Channel name:', channelName);
    await registry!.setup();
    await registry!.listen();
    console.log('Registry status:', registry!.getStatus());

    // Create a list first
    const list = await prisma!.list.create({
      data: {
        name: 'Test List for Special',
        owner: {
          create: {
            email: `test-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 11)}@example.com`,
            name: 'Test User 3'
          }
        }
      }
    });

    // Create a regular item - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'Regular Item',
        status: 'PENDING',
        listId: list.id
      }
    });

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications[channelName].length).toBe(0);

    // Create a special item - should trigger
    await prisma!.item.create({
      data: {
        name: 'Special Item',
        status: 'PENDING',
        listId: list.id
      }
    });

    console.log('=== AFTER SPECIAL ITEM ===');
    console.log('Received notifications:', receivedNotifications[channelName]);
    console.log(
      'All received notifications keys:',
      Object.keys(receivedNotifications)
    );

    await waitForCondition(
      () => receivedNotifications[channelName].length >= 1,
      2000
    );
    expect(receivedNotifications[channelName].length).toBe(1);
    expect(receivedNotifications[channelName][0].operation).toBe('INSERT');
  });

  test('should support defining triggers with custom IDs and listening to specific ones', async () => {
    // Create trigger manager
    triggerManager = createTriggers<NonNullable<typeof prisma>>(
      process.env.DATABASE_URL!
    );

    const channelPrefix = `enhanced_${testId}`;
    const channels = {
      created: `${channelPrefix}_created`,
      statusChanged: `${channelPrefix}_status_changed`,
      completed: `${channelPrefix}_completed`
    };

    // Initialize notification tracking
    receivedNotifications[channels.created] = [];
    receivedNotifications[channels.statusChanged] = [];
    receivedNotifications[channels.completed] = [];

    // Create registry with specific trigger IDs
    registry = triggerManager
      .registry()
      .define('item_created', {
        model: 'item',
        events: ['INSERT'],
        timing: 'AFTER',
        forEach: 'ROW',
        notify: channels.created
      })
      .define('item_status_changed', {
        model: 'item',
        events: ['UPDATE'],
        timing: 'AFTER',
        forEach: 'ROW',
        when: (c) => c.changed('status'),
        notify: channels.statusChanged
      })
      .define('item_completed', {
        model: 'item',
        events: ['UPDATE'],
        timing: 'AFTER',
        forEach: 'ROW',
        when: (c) =>
          c.and(
            c.OLD('status').ne('COMPLETED'),
            c.NEW('status').eq('COMPLETED')
          ),
        notify: channels.completed
      });

    // Track the actual trigger names for cleanup
    activeTriggerNames = [
      'item_created_trigger',
      'item_status_changed_trigger',
      'item_completed_trigger'
    ];

    // Subscribe to specific triggers by ID
    registry!.on('item_created', (event) => {
      receivedNotifications[channels.created].push(event);
    });

    registry!.on('item_status_changed', (event) => {
      receivedNotifications[channels.statusChanged].push(event);
    });

    registry!.on('item_completed', (event) => {
      receivedNotifications[channels.completed].push(event);
    });

    // Setup and listen
    await registry!.setup();
    await registry!.listen();
    
    // Wait a bit for the listeners to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create user and list
    const user = await prisma!.user.create({
      data: {
        email: `test-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 11)}@example.com`,
        name: 'Test User'
      }
    });

    const list = await prisma!.list.create({
      data: {
        name: 'Test List',
        ownerId: user.id
      }
    });

    // Test 1: Create item - should trigger item_created
    const item = await prisma!.item.create({
      data: {
        name: 'Test Item',
        status: 'PENDING',
        listId: list.id
      }
    });

    await waitForCondition(
      () => receivedNotifications[channels.created].length >= 1,
      5000
    );
    expect(receivedNotifications[channels.created].length).toBe(1);
    expect(receivedNotifications[channels.created][0].data.id).toBe(item.id);

    // Test 2: Update name only - should NOT trigger status_changed
    await prisma!.item.update({
      where: { id: item.id },
      data: { name: 'Updated Name' }
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications[channels.statusChanged].length).toBe(0);

    // Test 3: Update status to IN_PROGRESS - should trigger status_changed but NOT completed
    await prisma!.item.update({
      where: { id: item.id },
      data: { status: 'IN_PROGRESS' }
    });

    await waitForCondition(
      () => receivedNotifications[channels.statusChanged].length >= 1,
      2000
    );
    expect(receivedNotifications[channels.statusChanged].length).toBe(1);
    expect(receivedNotifications[channels.completed].length).toBe(0);

    // Test 4: Update status to COMPLETED - should trigger both status_changed AND completed
    await prisma!.item.update({
      where: { id: item.id },
      data: { status: 'COMPLETED' }
    });

    await waitForCondition(
      () =>
        receivedNotifications[channels.statusChanged].length >= 2 &&
        receivedNotifications[channels.completed].length >= 1,
      2000
    );
    expect(receivedNotifications[channels.statusChanged].length).toBe(2);
    expect(receivedNotifications[channels.completed].length).toBe(1);
    expect(receivedNotifications[channels.completed][0].data.status).toBe(
      'COMPLETED'
    );
  });

  test('registry should provide list of all trigger IDs', async () => {
    // Create trigger manager
    triggerManager = createTriggers<NonNullable<typeof prisma>>(
      process.env.DATABASE_URL!
    );

    // Create registry with multiple triggers
    registry = triggerManager
      .registry()
      .define('trigger_one', {
        model: 'item',
        events: ['INSERT'],
        timing: 'AFTER',
        notify: 'channel_one'
      })
      .define('trigger_two', {
        model: 'user',
        events: ['UPDATE'],
        timing: 'AFTER',
        notify: 'channel_two'
      })
      .define('trigger_three', {
        model: 'list',
        events: ['DELETE'],
        timing: 'BEFORE',
        notify: 'channel_three'
      });

    const triggerIds = registry!.getTriggerIds();
    expect(triggerIds).toContain('trigger_one');
    expect(triggerIds).toContain('trigger_two');
    expect(triggerIds).toContain('trigger_three');
    expect(triggerIds.length).toBe(3);
  });
});
