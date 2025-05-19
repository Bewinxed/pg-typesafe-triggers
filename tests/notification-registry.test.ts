// tests/notification-registry.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { prisma, triggers, resetNotifications } from './setup';
import { waitForCondition } from './utils';
import { NotificationPayload } from '../src';

describe('Notification Registry and Unified Subscription', () => {
  // Record received notifications for testing
  const receivedNotifications: Record<string, any[]> = {
    item_events: [],
    list_events: [],
    uwu_events: []
  };

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

    // Try to drop any existing triggers
    try {
      await triggers!.dropTrigger('item', 'item_registry_test_trigger');
      await triggers!.dropTrigger('list', 'list_registry_test_trigger');
      await triggers!.dropTrigger('uwU', 'uwu_registry_test_trigger');
    } catch (error) {
      // Ignore errors if triggers don't exist
    }
  });

  // Clean up after each test
  afterEach(async () => {
    try {
      await triggers!.dropTrigger('item', 'item_registry_test_trigger');
      await triggers!.dropTrigger('list', 'list_registry_test_trigger');
      await triggers!.dropTrigger('uwU', 'uwu_registry_test_trigger');
    } catch (error) {
      // Ignore errors if triggers don't exist
    }
  });

  test('should create a typed registry and subscribe to all channels', async () => {
    // Create a registry with channels for all three models
    const registry = triggers!
      .createRegistry()
      .defineChannel('item_events', 'item')
      .defineChannel('list_events', 'list')
      .defineChannel('uwu_events', 'uwU');

    // Create notification functions
    await registry.createAllFunctions(triggers!);

    // Create triggers for each model
    await triggers!
      .defineTrigger('item', registry)
      .withName('item_registry_test_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT', 'UPDATE', 'DELETE')
      .notifyOn('item_events')
      .create();

    await triggers!
      .defineTrigger('list', registry)
      .withName('list_registry_test_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT', 'UPDATE', 'DELETE')
      .notifyOn('list_events')
      .create();

    await triggers!
      .defineTrigger('uwU', registry)
      .withName('uwu_registry_test_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT', 'UPDATE', 'DELETE')
      .notifyOn('uwu_events')
      .create();

    // Create the client and subscription
    const client = triggers!.createClient(registry);
    const subscription = client.createSubscription();

    // Set up handlers for all channels
    subscription.on('item_events', (payload) => {
      // Test type safety - payload should have Item structure
      const itemPayload = payload as NotificationPayload<{
        id: string;
        name: string;
        status: string;
        listId: string | null;
      }>;

      // Record the notification
      receivedNotifications.item_events.push(itemPayload);
    });

    subscription.on('list_events', (payload) => {
      // Test type safety - payload should have List structure
      const listPayload = payload as NotificationPayload<{
        id: string;
        name: string;
      }>;

      // Record the notification
      receivedNotifications.list_events.push(listPayload);
    });

    subscription.on('uwu_events', (payload) => {
      // Test type safety - payload should have UwU structure
      const uwuPayload = payload as NotificationPayload<{
        id: string;
        what: string;
      }>;

      // Record the notification
      receivedNotifications.uwu_events.push(uwuPayload);
    });

    // Start subscription
    await subscription.subscribe();

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
    // We expect 7 notifications: 3 creates, 2 updates, 1 delete
    // Item: 2 creates, 1 update, 1 delete = 4 notifications
    // List: 1 create, 1 update = 2 notifications
    // UwU: 1 create = 1 notification

    // Wait for each channel to receive its expected count
    await Promise.all([
      waitForCondition(
        () => receivedNotifications.item_events.length >= 4,
        2000
      ),
      waitForCondition(
        () => receivedNotifications.list_events.length >= 2,
        2000
      ),
      waitForCondition(() => receivedNotifications.uwu_events.length >= 1, 2000)
    ]);

    // Verify we got the correct number of notifications for each channel
    expect(receivedNotifications.item_events.length).toBe(4);
    expect(receivedNotifications.list_events.length).toBe(2);
    expect(receivedNotifications.uwu_events.length).toBe(1);

    // Verify item notifications
    const itemInserts = receivedNotifications.item_events.filter(
      (n) => n.operation === 'INSERT'
    );
    const itemUpdates = receivedNotifications.item_events.filter(
      (n) => n.operation === 'UPDATE'
    );
    const itemDeletes = receivedNotifications.item_events.filter(
      (n) => n.operation === 'DELETE'
    );

    console.log(itemInserts);
    expect(itemInserts.length).toBe(2);
    expect(itemUpdates.length).toBe(1);
    expect(itemDeletes.length).toBe(1);

    // Verify specific item data
    const updatedItem = itemUpdates[0];
    expect(updatedItem.data.id).toBe(item1.id);
    expect(updatedItem.data.status).toBe('completed');

    // Verify list notifications
    const listInserts = receivedNotifications.list_events.filter(
      (n) => n.operation === 'INSERT'
    );
    const listUpdates = receivedNotifications.list_events.filter(
      (n) => n.operation === 'UPDATE'
    );

    expect(listInserts.length).toBe(1);
    expect(listUpdates.length).toBe(1);

    // Verify specific list data
    const updatedList = listUpdates[0];
    expect(updatedList.data.id).toBe(list.id);
    expect(updatedList.data.name).toBe('Updated Test List');

    // Verify UwU notifications
    const uwuInserts = receivedNotifications.uwu_events.filter(
      (n) => n.operation === 'INSERT'
    );
    expect(uwuInserts.length).toBe(1);
    expect(uwuInserts[0].data.id).toBe(uwu.id);
    expect(uwuInserts[0].data.what).toBe('Test UwU');

    // Test off() method - add another handler and then remove it
    let offHandlerCalled = false;
    const testHandler = (payload: NotificationPayload<any>) => {
      offHandlerCalled = true;
    };

    // Add the handler
    subscription.on('item_events', testHandler);

    // Create another item - should trigger both handlers
    await prisma!.item.create({
      data: {
        name: 'Test Item for Off',
        status: 'pending'
      }
    });

    await waitForCondition(
      () => receivedNotifications.item_events.length >= 5,
      2000
    );
    expect(receivedNotifications.item_events.length).toBe(5);

    // Reset the flag
    offHandlerCalled = false;

    // Remove the handler
    subscription.off('item_events', testHandler);

    // Create another item - should only trigger the original handler
    await prisma!.item.create({
      data: {
        name: 'Test Item After Off',
        status: 'pending'
      }
    });

    await waitForCondition(
      () => receivedNotifications.item_events.length >= 6,
      2000
    );
    expect(receivedNotifications.item_events.length).toBe(6);
    expect(offHandlerCalled).toBe(false);

    // Clean up - unsubscribe from all channels
    await subscription.unsubscribeAll();
  });

  test('should support individual channel subscriptions', async () => {
    // Create a registry with different channel names to avoid subscription conflicts
    const registry = triggers!
      .createRegistry()
      .defineChannel('item_events_2', 'item')
      .defineChannel('list_events_2', 'list');

    // Create notification functions
    await registry.createAllFunctions(triggers!);

    // Create triggers
    await triggers!
      .defineTrigger('item', registry)
      .withName('item_registry_test_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .notifyOn('item_events_2')
      .create();

    await triggers!
      .defineTrigger('list', registry)
      .withName('list_registry_test_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .notifyOn('list_events_2')
      .create();

    // Create client
    const client = triggers!.createClient(registry);

    // Initialize tracking arrays
    receivedNotifications['item_events_2'] = [];
    receivedNotifications['list_events_2'] = [];

    // Subscribe to individual channels
    const itemChannel = client.channel('item_events_2');
    const listChannel = client.channel('list_events_2');

    // Set up handlers
    await itemChannel.subscribe((payload) => {
      receivedNotifications['item_events_2'].push(payload);
    });

    await listChannel.subscribe((payload) => {
      receivedNotifications['list_events_2'].push(payload);
    });

    // Create an item and a list
    await prisma!.item.create({
      data: {
        name: 'Individual Subscription Item',
        status: 'pending'
      }
    });

    await prisma!.list.create({
      data: {
        name: 'Individual Subscription List'
      }
    });

    // Wait for notifications
    await Promise.all([
      waitForCondition(
        () => receivedNotifications['item_events_2'].length >= 1,
        2000
      ),
      waitForCondition(
        () => receivedNotifications['list_events_2'].length >= 1,
        2000
      )
    ]);

    // Verify we got notifications
    expect(receivedNotifications['item_events_2'].length).toBe(1);
    expect(receivedNotifications['list_events_2'].length).toBe(1);

    // Unsubscribe from one channel
    await itemChannel.unsubscribe();

    // Create another item - should not trigger notification
    await prisma!.item.create({
      data: {
        name: 'After Unsubscribe Item',
        status: 'pending'
      }
    });

    // Create another list - should still trigger notification
    await prisma!.list.create({
      data: {
        name: 'After Unsubscribe List'
      }
    });

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify item notification count didn't change, but list did
    expect(receivedNotifications['item_events_2'].length).toBe(1);
    expect(receivedNotifications['list_events_2'].length).toBe(2);

    // Clean up
    await listChannel.unsubscribe();
  });
});
