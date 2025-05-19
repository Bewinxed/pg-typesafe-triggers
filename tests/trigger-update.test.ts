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
    try {
      await triggers!.dropTrigger('item', 'test_update_trigger');
    } catch (error) {
      // Ignore errors if trigger doesn't exist
    }

    // Clear test data
    await prisma!.item.deleteMany({});
  });

  test('basic UPDATE trigger should fire on any item update', async () => {
    // Create a basic UPDATE trigger
    await triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .executeFunction('update_notify_func')
      .create();

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
    await triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .watchColumns('status')
      .executeFunction('update_notify_func')
      .create();

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
    await triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withTypedCondition(({ NEW }) => NEW.status === 'active')
      .executeFunction('update_notify_func')
      .create();

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
    await triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE')
      .withTypedCondition(({ OLD, NEW }) => OLD.status !== NEW.status)
      .executeFunction('update_notify_func')
      .create();

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

  test('UPDATE trigger with condition builder using fieldChanged should work', async () => {
    // Create trigger using the condition builder that watches for status changes
    const triggerDef = triggers!
      .defineTrigger('item')
      .withName('test_update_trigger')
      .withTiming('AFTER')
      .onEvents('UPDATE');

    const conditionBuilder = triggerDef.withConditionBuilder();
    conditionBuilder.fieldChanged('status');
    conditionBuilder.build();

    await triggerDef.executeFunction('update_notify_func').create();

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
