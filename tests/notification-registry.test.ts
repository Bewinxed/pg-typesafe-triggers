// tests/notification-registry.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { prisma, resetNotifications, pgClient } from './setup';
import { waitForCondition } from './utils';
import { NotificationPayload } from '../src';
import { Registry } from '../src/trigger/registry';

describe('Notification Registry and Unified Subscription', () => {
  // Record received notifications for testing with unique channel names per test
  const testId = Math.random().toString(36).substring(7);
  const receivedNotifications: Record<string, any[]> = {};

  let registry: Registry<NonNullable<typeof prisma>> | null = null;
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
  });

  // Clean up after each test
  afterEach(async () => {
    if (registry) {
      try {
        await registry.stopListening();
      } catch (error) {
        console.warn('Error stopping registry:', error);
      }
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

    // Create a registry with channels for all three models
    registry = new Registry<NonNullable<typeof prisma>>(pgClient!);

    // Configure models with default triggers
    registry
      .models('item', 'list', 'uwU')
      .model('item')
      .onEvents('INSERT', 'UPDATE', 'DELETE')
      .model('list')
      .onEvents('INSERT', 'UPDATE', 'DELETE')
      .model('uwU')
      .onEvents('INSERT', 'UPDATE', 'DELETE');

    activeTriggerNames = [
      'item_registry_trigger',
      'list_registry_trigger',
      'uwU_registry_trigger'
    ];

    // Set up handlers for all channels - map to model names as that's how the Registry API works
    registry.on('item', (payload) => {
      const itemPayload = payload as NotificationPayload<{
        id: string;
        name: string;
        status: string;
        listId: string | null;
      }>;
      receivedNotifications[channels.item].push(itemPayload);
    });

    registry.on('list', (payload) => {
      const listPayload = payload as NotificationPayload<{
        id: string;
        name: string;
      }>;
      receivedNotifications[channels.list].push(listPayload);
    });

    registry.on('uwU', (payload) => {
      const uwuPayload = payload as NotificationPayload<{
        id: string;
        what: string;
      }>;
      receivedNotifications[channels.uwu].push(uwuPayload);
    });

    // Setup database and start listening
    await registry.setup();

    // Perform database operations to trigger events

    // Create items
    const item1 = await prisma!.item.create({
      data: {
        name: 'Test Item 1',
        status: 'pending'
      }
    });

    const item2 = await prisma!.item.create({
      data: {
        name: 'Test Item 2',
        status: 'active'
      }
    });

    // Create a list
    const list = await prisma!.list.create({
      data: {
        name: 'Test List'
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
      data: { status: 'completed' }
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
    expect(updatedItem.data.status).toBe('completed');

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

  test('should support off() method for removing handlers', async () => {
    const channelName = `item_events_${testId}_2`;
    receivedNotifications[channelName] = [];

    // Create a simple registry for this test
    registry = new Registry<NonNullable<typeof prisma>>(pgClient!);
    registry.models('item').model('item').onEvents('INSERT');

    activeTriggerNames = ['item_registry_trigger'];

    let handlerCallCount = 0;
    const testHandler = (payload: NotificationPayload<any>) => {
      handlerCallCount++;
      receivedNotifications[channelName].push(payload);
    };

    // Add the handler
    registry.on('item', testHandler);

    // Setup and start listening
    await registry.setup();

    // Create an item - should trigger handler
    await prisma!.item.create({
      data: {
        name: 'Test Item for Off',
        status: 'pending'
      }
    });

    await waitForCondition(
      () => receivedNotifications[channelName].length >= 1,
      2000
    );
    expect(receivedNotifications[channelName].length).toBe(1);
    expect(handlerCallCount).toBe(1);

    // Remove the handler
    registry.off('item', testHandler);

    // Reset counters
    handlerCallCount = 0;
    receivedNotifications[channelName] = [];

    // Create another item - should NOT trigger the removed handler
    await prisma!.item.create({
      data: {
        name: 'Test Item After Off',
        status: 'pending'
      }
    });

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify the handler was not called
    expect(handlerCallCount).toBe(0);
    expect(receivedNotifications[channelName].length).toBe(0);
  });

  test('should handle custom channels and triggers', async () => {
    // Simplify - use a static channel name that matches what Registry expects
    const channelName = 'special_events';
    receivedNotifications[channelName] = [];

    // Add a small delay to ensure previous test cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create a registry with custom channels - use completely fresh instance
    registry = new Registry<NonNullable<typeof prisma>>(pgClient!);

    // Configure custom channel and trigger with static name
    registry.custom(channelName, { id: 'string', message: 'string' });

    // Add a model with a custom trigger that uses the custom channel
    registry.model('item').trigger('special', {
      on: ['INSERT'],
      when: ({ NEW }) => NEW.name.startsWith('Special')
    });

    activeTriggerNames = ['item_special_trigger'];

    // Set up handler for custom trigger - use the static channel name
    registry.on(channelName, (payload) => {
      const itemPayload = payload as NotificationPayload<{
        id: string;
        name: string;
        status: string;
        listId: string | null;
      }>;

      console.log(
        '*** HANDLER CALLED ***',
        itemPayload.operation,
        itemPayload.data?.name
      );
      receivedNotifications[channelName].push(payload);
    });

    console.log('=== DEBUG INFO ===');
    console.log('Channel name:', channelName);
    await registry.setup();
    console.log('Registry status:', registry.getStatus());
    console.log('Active subscriptions in test setup');

    const subscriptionClient = (registry as any).subscriptionClient;
    console.log(
      'Handler count AFTER setup for',
      channelName,
      ':',
      subscriptionClient.getHandlerCount(channelName)
    );
    console.log(
      'All active channels AFTER setup:',
      subscriptionClient.getActiveChannels()
    );

    // Create a regular item - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'Regular Item',
        status: 'pending'
      }
    });

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications[channelName].length).toBe(0);

    // Create a special item - should trigger
    await prisma!.item.create({
      data: {
        name: 'Special Item',
        status: 'pending'
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
