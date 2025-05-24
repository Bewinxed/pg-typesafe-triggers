// tests/notification-registry.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { prisma, resetNotifications, pgClient } from './setup';
import { waitForCondition } from './utils';
import { TriggerEvent, TriggerRegistry, createTriggers } from '../src';

describe('Notification Registry and Unified Subscription', () => {
  // Record received notifications for testing with unique channel names per test
  const testId = Math.random().toString(36).substring(7);
  const receivedNotifications: Record<string, any[]> = {};

  let registry: TriggerRegistry<NonNullable<typeof prisma>> | null = null;
  let triggerManager: ReturnType<typeof createTriggers<NonNullable<typeof prisma>>> | null = null;
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

    activeTriggerNames = [];
    registry = null;
    triggerManager = null;
  });

  // Clean up after each test
  afterEach(async () => {
    if (registry) {
      try {
        await registry.stop();
        await registry.drop();
      } catch (error) {
        console.warn('Error stopping registry:', error);
      }
    }

    if (triggerManager) {
      try {
        await triggerManager.dispose();
      } catch (error) {
        console.warn('Error disposing trigger manager:', error);
      }
      triggerManager = null;
    }

    // Drop triggers manually with proper names
    const tables = ['Item', 'List', 'UwU'];
    for (const triggerName of activeTriggerNames) {
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
    registry.add('item', {
      name: 'item_registry_trigger',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'item_notify_func',
      notify: channels.item
    });

    registry.add('list', {
      name: 'list_registry_trigger',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'list_notify_func',
      notify: channels.list
    });

    registry.add('uwU', {
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
    registry.on('item', (event: TriggerEvent<NonNullable<typeof prisma>, 'item', any>) => {
      receivedNotifications[channels.item].push(event);
    });

    registry.on('list', (event: TriggerEvent<NonNullable<typeof prisma>, 'list', any>) => {
      receivedNotifications[channels.list].push(event);
    });

    registry.on('uwU', (event: TriggerEvent<NonNullable<typeof prisma>, 'uwU', any>) => {
      receivedNotifications[channels.uwu].push(event);
    });

    // Setup database and start listening
    await registry.setup();
    await registry.listen();

    // Perform database operations to trigger events

    // Create a user and list first
    const user = await prisma!.user.create({
      data: {
        email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}@example.com`,
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
    const list2 = await prisma!.list.create({
      data: {
        name: 'Test List',
        owner: {
          create: {
            email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}@example.com`,
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
        3000
      ),
      waitForCondition(
        () => receivedNotifications[channels.list].length >= 2,
        3000
      ),
      waitForCondition(
        () => receivedNotifications[channels.uwu].length >= 1,
        3000
      )
    ]);

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
    registry.add('item', {
      name: 'item_registry_trigger',
      events: ['INSERT'],
      timing: 'AFTER',
      forEach: 'ROW',
      functionName: 'item_notify_func',
      notify: channelName
    });

    activeTriggerNames = ['item_registry_trigger'];

    let handlerCallCount = 0;
    const testHandler = (event: TriggerEvent<NonNullable<typeof prisma>, 'item', any>) => {
      handlerCallCount++;
      receivedNotifications[channelName].push(event);
    };

    // Add the handler
    const unsubscribe = registry.on('item', testHandler);

    // Setup and start listening
    await registry.setup();
    await registry.listen();

    // Create a list first
    const list = await prisma!.list.create({
      data: {
        name: 'Test List for Off',
        owner: {
          create: {
            email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}@example.com`,
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
    registry.add('item', {
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
    registry.on('item', (event: TriggerEvent<NonNullable<typeof prisma>, 'item', any>) => {
      console.log(
        '*** HANDLER CALLED ***',
        event.operation,
        event.data?.name
      );
      receivedNotifications[channelName].push(event);
    });

    console.log('=== DEBUG INFO ===');
    console.log('Channel name:', channelName);
    await registry.setup();
    await registry.listen();
    console.log('Registry status:', registry.getStatus());

    // Create a list first
    const list = await prisma!.list.create({
      data: {
        name: 'Test List for Special',
        owner: {
          create: {
            email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}@example.com`,
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
});