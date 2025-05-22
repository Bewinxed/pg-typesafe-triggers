// tests/trigger-delete.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  prisma,
  triggers,
  receivedNotifications,
  resetNotifications
} from './setup';
import { waitForNotifications, assertNotificationPayload } from './utils';

describe('DELETE Triggers', () => {
  let testItemId: string;
  let testItem: any;
  let currentTriggerManager: any = null;

  beforeEach(async () => {
    resetNotifications();

    // Create a test item for delete operations
    testItem = await prisma!.item.create({
      data: {
        name: 'Test Item For Deletion',
        status: 'pending'
      }
    });
    testItemId = testItem.id;
  });

  afterEach(async () => {
    // Remove any triggers created in tests
    if (currentTriggerManager) {
      try {
        await currentTriggerManager.dropTrigger();
      } catch (error) {
        // Ignore errors if trigger doesn't exist
      }
      currentTriggerManager = null;
    }

    // Clear any remaining test data
    await prisma!.item.deleteMany({});
  });

  test('basic DELETE trigger should fire on item deletion', async () => {
    // Create a basic DELETE trigger
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_delete_trigger')
      .withTiming('AFTER')
      .onEvents('DELETE')
      .executeFunction('delete_notify_func');

    await currentTriggerManager.setupDatabase();

    // Delete the test item
    await prisma!.item.delete({
      where: { id: testItemId }
    });

    // Wait for the notification
    const received = await waitForNotifications('delete_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['delete_test'][0];
    assertNotificationPayload(notification, 'DELETE', {
      id: testItemId,
      name: 'Test Item For Deletion',
      status: 'pending'
    });
  });

  test('conditional DELETE trigger should only fire when condition is met', async () => {
    // First, let's create two test items with different statuses
    const activeItem = await prisma!.item.create({
      data: {
        name: 'Active Item For Deletion',
        status: 'active'
      }
    });

    // Create a conditional DELETE trigger that only fires when status is 'active'
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_delete_trigger')
      .withTiming('AFTER')
      .onEvents('DELETE')
      .withCondition(({ OLD }) => OLD.status === 'active')
      .executeFunction('delete_notify_func');

    await currentTriggerManager.setupDatabase();

    // Delete the pending item - should NOT trigger
    await prisma!.item.delete({
      where: { id: testItemId }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['delete_test'].length).toBe(0);

    // Delete the active item - should trigger
    await prisma!.item.delete({
      where: { id: activeItem.id }
    });

    // Wait for the notification
    const received = await waitForNotifications('delete_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['delete_test'][0];
    assertNotificationPayload(notification, 'DELETE', {
      id: activeItem.id,
      name: 'Active Item For Deletion',
      status: 'active'
    });
  });

  test('DELETE trigger with raw SQL condition should work', async () => {
    // Create another test item with a special name
    const specialItem = await prisma!.item.create({
      data: {
        name: 'Special Item For Deletion',
        status: 'pending'
      }
    });

    // For DELETE triggers, we need to use raw SQL condition because
    // DELETE triggers can only reference OLD values, not NEW values
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_delete_trigger')
      .withTiming('AFTER')
      .onEvents('DELETE')
      .withCondition('OLD."name" LIKE \'Special%\'') // Use raw SQL condition with OLD
      .executeFunction('delete_notify_func');

    await currentTriggerManager.setupDatabase();

    // Delete the normal item - should NOT trigger
    await prisma!.item.delete({
      where: { id: testItemId }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['delete_test'].length).toBe(0);

    // Delete the special item - should trigger
    await prisma!.item.delete({
      where: { id: specialItem.id }
    });

    // Wait for the notification
    const received = await waitForNotifications('delete_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['delete_test'][0];
    assertNotificationPayload(notification, 'DELETE', {
      id: specialItem.id,
      name: 'Special Item For Deletion'
    });
  });
});
