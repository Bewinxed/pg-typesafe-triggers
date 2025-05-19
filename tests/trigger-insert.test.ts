// tests/trigger-insert.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  prisma,
  triggers,
  receivedNotifications,
  resetNotifications
} from './setup';
import { waitForNotifications, assertNotificationPayload } from './utils';

describe('INSERT Triggers', () => {
  beforeEach(() => {
    resetNotifications();
  });

  afterEach(async () => {
    // Remove any triggers created in tests
    try {
      await triggers!.dropTrigger('item', 'test_insert_trigger'); // Use correct capitalization
    } catch (error) {
      // Ignore errors if trigger doesn't exist
    }

    // Clear test data
    await prisma!.item.deleteMany({});
  });

  test('basic INSERT trigger should fire on item creation', async () => {
    // Create a basic INSERT trigger
    await triggers!
      .defineTrigger('item') // Use correct capitalization
      .withName('test_insert_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .executeFunction('insert_notify_func')
      .create();

    // Create an item that should trigger the notification
    const item = await prisma!.item.create({
      data: {
        name: 'Test Item 1',
        status: 'pending'
      }
    });

    // Wait for the notification
    const received = await waitForNotifications('insert_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['insert_test'][0];
    assertNotificationPayload(notification, 'INSERT', {
      id: item.id,
      name: 'Test Item 1',
      status: 'pending'
    });
  });

  test('conditional INSERT trigger should only fire when condition is met', async () => {
    // Create a conditional INSERT trigger that only fires when status is 'active'
    await triggers!
      .defineTrigger('item') // Use correct capitalization
      .withName('test_insert_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .withTypedCondition(({ NEW }) => NEW.status === 'active')
      .executeFunction('insert_notify_func')
      .create();

    // Create an item with status 'pending' - should NOT trigger
    await prisma!.item.create({
      data: {
        name: 'Test Item Pending',
        status: 'pending'
      }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['insert_test'].length).toBe(0);

    // Create an item with status 'active' - should trigger
    const activeItem = await prisma!.item.create({
      data: {
        name: 'Test Item Active',
        status: 'active'
      }
    });

    // Wait for the notification
    const received = await waitForNotifications('insert_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['insert_test'][0];
    assertNotificationPayload(notification, 'INSERT', {
      id: activeItem.id,
      name: 'Test Item Active',
      status: 'active'
    });
  });

  test('INSERT trigger using condition builder should work', async () => {
    // Create trigger using the condition builder
    const triggerDef = triggers!
      .defineTrigger('item') // Use correct capitalization
      .withName('test_insert_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT');

    const conditionBuilder = triggerDef.withConditionBuilder();
    conditionBuilder.where('name', 'LIKE', 'Special%');
    conditionBuilder.build();

    await triggerDef.executeFunction('insert_notify_func').create();

    // Create an item that should NOT trigger (name doesn't match)
    await prisma!.item.create({
      data: {
        name: 'Regular Item',
        status: 'pending'
      }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['insert_test'].length).toBe(0);

    // Create an item that should trigger (name matches pattern)
    const specialItem = await prisma!.item.create({
      data: {
        name: 'Special Item',
        status: 'pending'
      }
    });

    // Wait for the notification
    const received = await waitForNotifications('insert_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['insert_test'][0];
    assertNotificationPayload(notification, 'INSERT', {
      id: specialItem.id,
      name: 'Special Item',
      status: 'pending'
    });
  });
});
