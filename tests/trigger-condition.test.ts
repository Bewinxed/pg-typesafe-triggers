// tests/trigger-condition.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  prisma,
  triggers,
  receivedNotifications,
  resetNotifications,
  pgClient
} from './setup';
import { waitForNotifications, assertNotificationPayload } from './utils';
import { TriggerManager } from '../src/trigger/manager';

describe('Complex Trigger Conditions', () => {
  let currentTriggerManagers: any[] = [];

  beforeEach(() => {
    resetNotifications();
    currentTriggerManagers = [];
  });

  afterEach(async () => {
    // Remove any triggers created in tests
    for (const triggerManager of currentTriggerManagers) {
      try {
        await triggerManager.getManager().stopListening();
        await triggerManager.getManager().dropTrigger();
      } catch (error) {
        // Ignore errors if trigger doesn't exist
      }
    }
    currentTriggerManagers = [];

    // Clear test data
    await prisma!.item.deleteMany({});
    await prisma!.list.deleteMany({});
    await prisma!.uwU.deleteMany({});
  });

  test('complex condition with AND logic should work', async () => {
    // Create a trigger with multiple conditions joined by AND
    const triggerManager = triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .withCondition(
        'NEW."name" LIKE \'Complex%\' AND NEW."status" = \'active\''
      )
      .notifyOn('condition_test');

    currentTriggerManagers.push(triggerManager);
    await triggerManager.setup();

    // Case 1: name matches but status doesn't - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'Complex Item 1',
        status: 'pending'
      }
    });

    // Case 2: status matches but name doesn't - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'Simple Item',
        status: 'active'
      }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['condition_test'].length).toBe(0);

    // Case 3: both conditions match - should trigger
    const matchingItem = await prisma!.item.create({
      data: {
        name: 'Complex Item 2',
        status: 'active'
      }
    });

    // Wait for the notification
    const received = await waitForNotifications('condition_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['condition_test'][0];
    assertNotificationPayload(notification, 'INSERT', {
      id: matchingItem.id,
      name: 'Complex Item 2',
      status: 'active'
    });
  });

  test('complex condition with OR logic should work', async () => {
    // Create a trigger with multiple conditions joined by OR
    const triggerManager = triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .withCondition(
        'NEW."name" = \'OR Test Item\' OR NEW."status" = \'special\''
      )
      .notifyOn('condition_test'); // Use notifyOn instead of executeFunction

    currentTriggerManagers.push(triggerManager);
    await triggerManager.setup(); // Use setup() which does both setupDatabase() and startListening()

    // Case 1: first condition matches - should trigger
    const item1 = await prisma!.item.create({
      data: {
        name: 'OR Test Item',
        status: 'pending'
      }
    });

    // Case 2: second condition matches - should trigger
    const item2 = await prisma!.item.create({
      data: {
        name: 'Another Item',
        status: 'special'
      }
    });

    // Case 3: neither condition matches - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'Regular Item',
        status: 'pending'
      }
    });

    // Wait for notifications
    const received = await waitForNotifications('condition_test', 2);
    expect(received).toBe(true);
    expect(receivedNotifications['condition_test'].length).toBe(2);

    // Check that the correct items triggered notifications
    const notifications = receivedNotifications['condition_test'];
    const notifiedIds = notifications.map((n) => n.data.id);
    expect(notifiedIds).toContain(item1.id);
    expect(notifiedIds).toContain(item2.id);
  });

  test('raw SQL condition should work for advanced cases', async () => {
    // Create a trigger with a raw SQL condition
    const triggerManager = triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .withCondition('NEW."name" LIKE \'SQL%\' AND length(NEW."name") > 5')
      .notifyOn('condition_test');

    currentTriggerManagers.push(triggerManager);
    await triggerManager.setup();

    // Case 1: name starts with SQL but too short - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'SQL',
        status: 'pending'
      }
    });

    // Case 2: name is long but doesn't start with SQL - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'Not SQL but long',
        status: 'pending'
      }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['condition_test'].length).toBe(0);

    // Case 3: meets both conditions - should trigger
    const matchingItem = await prisma!.item.create({
      data: {
        name: 'SQL Condition Test',
        status: 'pending'
      }
    });

    // Wait for the notification
    const received = await waitForNotifications('condition_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['condition_test'][0];
    assertNotificationPayload(notification, 'INSERT', {
      id: matchingItem.id,
      name: 'SQL Condition Test'
    });
  });

  test('typed condition comparing OLD and NEW values should work', async () => {
    // Create a test item for updates
    const initialItem = await prisma!.item.create({
      data: {
        name: 'Status Update Test',
        status: 'pending'
      }
    });

    // Create a trigger that detects status transitions from pending to completed
    const triggerManager = triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withCondition(
        ({ OLD, NEW }) => OLD.status === 'pending' && NEW.status === 'completed'
      )
      .notifyOn('condition_test');

    currentTriggerManagers.push(triggerManager);
    await triggerManager.setup();

    // Case 1: status changes but not from pending to completed - should NOT trigger
    await prisma!.item.update({
      where: { id: initialItem.id },
      data: { status: 'active' }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['condition_test'].length).toBe(0);

    // Create another item with pending status
    const anotherItem = await prisma!.item.create({
      data: {
        name: 'Another Status Test',
        status: 'pending'
      }
    });

    // Case 2: update from pending to completed - should trigger
    const updatedItem = await prisma!.item.update({
      where: { id: anotherItem.id },
      data: { status: 'completed' }
    });

    // Wait for the notification
    const received = await waitForNotifications('condition_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['condition_test'][0];
    assertNotificationPayload(notification, 'UPDATE', {
      id: anotherItem.id,
      name: 'Another Status Test',
      status: 'completed'
    });
  });

  test('trigger should work with UwU model', async () => {
    console.log('=== DEBUGGING UwU TEST ===');

    // Create a fresh TriggerManager instance for this test
    const freshTriggerManager = new TriggerManager<NonNullable<typeof prisma>>(
      pgClient!
    );

    console.log('Fresh manager created');

    // Test that our library works with the UwU model (different casing)
    const triggerBuilder = freshTriggerManager.defineTrigger('uwU');
    console.log(
      'After defineTrigger:',
      triggerBuilder.getManager().internal.getTriggerDef()
    );

    const withName = triggerBuilder.withName('uwu_trigger');
    console.log(
      'After withName:',
      withName.getManager().internal.getTriggerDef()
    );

    const withTiming = withName.withTiming('AFTER');
    console.log(
      'After withTiming:',
      withTiming.getManager().internal.getTriggerDef()
    );

    const withEvents = withTiming.onEvents('INSERT');
    console.log(
      'After onEvents:',
      withEvents.getManager().internal.getTriggerDef()
    );

    const triggerManager = withEvents.notifyOn('condition_test');
    console.log(
      'After notifyOn:',
      triggerManager.getManager().internal.getTriggerDef()
    );

    currentTriggerManagers.push(triggerManager);
    await triggerManager.setup();

    // Create a UwU record
    const uwu = await prisma!.uwU.create({
      data: {
        what: 'UwU Test'
      }
    });

    // Wait for the notification
    const received = await waitForNotifications('condition_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['condition_test'][0];
    assertNotificationPayload(notification, 'INSERT', {
      id: uwu.id,
      what: 'UwU Test'
    });
  });

  test('multi-event trigger should work', async () => {
    // Create a fresh TriggerManager instance for this test
    const freshTriggerManager = new TriggerManager<NonNullable<typeof prisma>>(
      pgClient!
    );

    // Create a trigger that fires on multiple event types
    const triggerManager = freshTriggerManager
      .defineTrigger('list')
      .withName('list_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT', 'UPDATE', 'DELETE')
      .notifyOn('condition_test'); // No condition - just fire on all events

    currentTriggerManagers.push(triggerManager);
    await triggerManager.setup();

    // Test INSERT
    const list = await prisma!.list.create({
      data: { name: 'Multi-Event Test List' }
    });

    // Wait for the notification
    await waitForNotifications('condition_test', 1);
    expect(receivedNotifications['condition_test'].length).toBe(1);

    // Test UPDATE
    await prisma!.list.update({
      where: { id: list.id },
      data: { name: 'Updated List Name' }
    });

    // Wait for the second notification
    await waitForNotifications('condition_test', 2);
    expect(receivedNotifications['condition_test'].length).toBe(2);

    // Test DELETE
    await prisma!.list.delete({
      where: { id: list.id }
    });

    // Wait for the third notification
    await waitForNotifications('condition_test', 3);
    expect(receivedNotifications['condition_test'].length).toBe(3);

    // Verify all notifications have the correct operations
    expect(receivedNotifications['condition_test'][0].operation).toBe('INSERT');
    expect(receivedNotifications['condition_test'][1].operation).toBe('UPDATE');
    expect(receivedNotifications['condition_test'][2].operation).toBe('DELETE');
  });
});
