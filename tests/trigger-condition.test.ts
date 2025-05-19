// tests/trigger-condition.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  prisma,
  triggers,
  receivedNotifications,
  resetNotifications
} from './setup';
import { waitForNotifications, assertNotificationPayload } from './utils';

describe('Complex Trigger Conditions', () => {
  beforeEach(() => {
    resetNotifications();
  });

  afterEach(async () => {
    // Remove any triggers created in tests
    try {
      await triggers!.dropTrigger('item', 'complex_trigger');
      await triggers!.dropTrigger('uwU', 'uwu_trigger');
      await triggers!.dropTrigger('list', 'list_trigger');
    } catch (error) {
      // Ignore errors if trigger doesn't exist
    }

    // Clear test data
    await prisma!.item.deleteMany({});
    await prisma!.list.deleteMany({});
    await prisma!.uwU.deleteMany({});
  });

  test('complex condition with AND logic should work', async () => {
    // Create a trigger with multiple conditions joined by AND
    const triggerDef = triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT');

    const conditionBuilder = triggerDef.withConditionBuilder();
    conditionBuilder.where('name', 'LIKE', 'Complex%');
    conditionBuilder.where('status', '=', 'active');
    conditionBuilder.build(); // Joins with AND by default

    await triggerDef.executeFunction('condition_notify_func').create();

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
    const triggerDef = triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT');

    const conditionBuilder = triggerDef.withConditionBuilder();
    conditionBuilder.where('name', '=', 'OR Test Item');
    conditionBuilder.where('status', '=', 'special');
    conditionBuilder.buildOr(); // Use OR logic instead of AND

    await triggerDef.executeFunction('condition_notify_func').create();

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
    await triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .withCondition('NEW."name" LIKE \'SQL%\' AND length(NEW."name") > 5')
      .executeFunction('condition_notify_func')
      .create();

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
    await triggers!
      .defineTrigger('item')
      .withName('complex_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withTypedCondition(
        ({ OLD, NEW }) => OLD.status === 'pending' && NEW.status === 'completed'
      )
      .executeFunction('condition_notify_func')
      .create();

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
    // Test that our library works with the UwU model (different casing)
    await triggers!
      .defineTrigger('uwU')
      .withName('uwu_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .executeFunction('condition_notify_func')
      .create();

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
    // Create a trigger that fires on multiple event types
    await triggers!
      .defineTrigger('list')
      .withName('list_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT', 'UPDATE', 'DELETE')
      .executeFunction('condition_notify_func')
      .create();

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
