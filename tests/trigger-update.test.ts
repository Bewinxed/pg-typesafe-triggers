// tests/trigger-update.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  prisma,
  triggers,
  receivedNotifications,
  resetNotifications
} from './setup';
import { waitForNotifications, assertNotificationPayload } from './utils';

describe('UPDATE Triggers', () => {
  let testItemId: string;
  let currentTriggerManager: any = null;

  beforeEach(async () => {
    resetNotifications();

    // Create a test item for update operations
    const item = await prisma!.item.create({
      data: {
        name: 'Test Item For Updates',
        status: 'pending'
      }
    });
    testItemId = item.id;
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

    // Clear test data
    await prisma!.item.deleteMany({});
  });

  test('basic UPDATE trigger should fire on any item update', async () => {
    // Create a basic UPDATE trigger
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .executeFunction('update_notify_func');

    await currentTriggerManager.setupDatabase();

    // Update the test item
    const updatedItem = await prisma!.item.update({
      where: { id: testItemId },
      data: {
        name: 'Updated Item Name',
        status: 'completed'
      }
    });

    // Wait for the notification
    const received = await waitForNotifications('update_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['update_test'][0];
    assertNotificationPayload(notification, 'UPDATE', {
      id: updatedItem.id,
      name: 'Updated Item Name',
      status: 'completed'
    });
  });

  test('UPDATE trigger should only fire when watched column changes', async () => {
    // Create an UPDATE trigger that only watches the status column
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .watchColumns('status')
      .executeFunction('update_notify_func');

    await currentTriggerManager.setupDatabase();

    // Update only the name - should NOT trigger
    await prisma!.item.update({
      where: { id: testItemId },
      data: { name: 'Updated Name Only' }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['update_test'].length).toBe(0);

    // Update the status - should trigger
    const updatedItem = await prisma!.item.update({
      where: { id: testItemId },
      data: { status: 'completed' }
    });

    // Wait for the notification
    const received = await waitForNotifications('update_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['update_test'][0];
    assertNotificationPayload(notification, 'UPDATE', {
      id: updatedItem.id,
      name: 'Updated Name Only', // Name from previous update
      status: 'completed' // New status
    });
  });

  test('conditional UPDATE trigger should only fire when condition is met', async () => {
    // Create a conditional UPDATE trigger that only fires when status changes to 'active'
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withCondition(({ NEW }) => NEW.status === 'active')
      .executeFunction('update_notify_func');

    await currentTriggerManager.setupDatabase();

    // Update to status 'completed' - should NOT trigger
    await prisma!.item.update({
      where: { id: testItemId },
      data: { status: 'completed' }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['update_test'].length).toBe(0);

    // Update to status 'active' - should trigger
    const updatedItem = await prisma!.item.update({
      where: { id: testItemId },
      data: { status: 'active' }
    });

    // Wait for the notification
    const received = await waitForNotifications('update_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['update_test'][0];
    assertNotificationPayload(notification, 'UPDATE', {
      id: updatedItem.id,
      status: 'active'
    });
  });

  test('UPDATE trigger with field comparison condition should work', async () => {
    // Create UPDATE trigger that detects when the status is changed
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withCondition(({ OLD, NEW }) => OLD.status !== NEW.status)
      .executeFunction('update_notify_func');

    await currentTriggerManager.setupDatabase();

    // Update only the name - should NOT trigger a status change
    await prisma!.item.update({
      where: { id: testItemId },
      data: { name: 'New Name Without Status Change' }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['update_test'].length).toBe(0);

    // Update the status - should trigger
    const updatedItem = await prisma!.item.update({
      where: { id: testItemId },
      data: { status: 'completed' }
    });

    // Wait for the notification
    const received = await waitForNotifications('update_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['update_test'][0];
    assertNotificationPayload(notification, 'UPDATE', {
      id: updatedItem.id,
      name: 'New Name Without Status Change',
      status: 'completed'
    });
  });

  test('UPDATE trigger with raw SQL condition should work', async () => {
    // Create trigger using raw SQL condition that watches for status changes
    currentTriggerManager = triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withCondition('NEW."status" IS DISTINCT FROM OLD."status"')
      .executeFunction('update_notify_func');

    await currentTriggerManager.setupDatabase();

    // Update only the name - should NOT trigger
    await prisma!.item.update({
      where: { id: testItemId },
      data: { name: 'Only Name Update' }
    });

    // Wait a moment to ensure no notification is fired
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedNotifications['update_test'].length).toBe(0);

    // Update the status - should trigger
    const updatedItem = await prisma!.item.update({
      where: { id: testItemId },
      data: { status: 'active' }
    });

    // Wait for the notification
    const received = await waitForNotifications('update_test', 1);
    expect(received).toBe(true);

    // Verify the notification payload
    const notification = receivedNotifications['update_test'][0];
    assertNotificationPayload(notification, 'UPDATE', {
      id: updatedItem.id,
      name: 'Only Name Update',
      status: 'active'
    });
  });
});
