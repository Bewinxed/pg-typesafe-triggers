import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { Registry } from '../src/trigger/registry';

// Initialize clients
const prisma = new PrismaClient();
const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  // Initialize registry and build it up with proper type accumulation
  const registry = new Registry<typeof prisma>(sql)
    .models('item', 'list', 'uwU') // Add models to watch
    .model('item')
    .onEvents('INSERT', 'UPDATE', 'DELETE') // Configure events for item
    .model('list')
    .onEvents('INSERT', 'UPDATE', 'DELETE') // Configure events for list
    .model('uwU')
    .onEvents('INSERT') // Only watch inserts for uwU
    .model('item')
    .trigger('status_changes', {
      on: ['UPDATE'],
      when: ({ NEW, OLD }) => NEW.status !== OLD.status
    })
    .custom('payment_events', {
      id: 'string' as const,
      amount: 'number' as const,
      status: 'string' as const
    });

  // Set up database and start listening
  await registry.setup(); // Creates all functions, triggers, and starts listening

  // Add handlers for different channels - now with full IntelliSense and typing
  registry.on('item', (payload) => {
    // Fully typed - payload.data has Item type
    console.log(`Item ${payload.data.id} was ${payload.operation}`);
    console.log(
      `Item name: ${payload.data.name}, status: ${payload.data.status}`
    );
  });

  registry.on('list', (payload) => {
    // Fully typed - payload.data has List type
    console.log(`List ${payload.data.name} was ${payload.operation}`);
    console.log(`List ID: ${payload.data.id}`);
  });

  registry.on('uwU', (payload) => {
    // Fully typed - payload.data has UwU type
    console.log(`UwU ${payload.data.id} was ${payload.operation}`);
    console.log(`UwU what: ${payload.data.what}`);
  });

  registry.on('status_changes', (payload) => {
    // Custom trigger handler - fully typed as Item
    console.log(`Item status changed: ${payload.data.status}`);
    console.log(`Item ID: ${payload.data.id}, Name: ${payload.data.name}`);
  });

  registry.on('payment_events', (payload) => {
    // Custom channel handler - fully typed with custom schema
    console.log(`Payment: $${payload.data.amount}`);
    console.log(
      `Payment ID: ${payload.data.id}, Status: ${payload.data.status}`
    );
  });

  // Test the triggers with actual database operations
  console.log('Creating test item...');
  const testItem = await prisma.item.create({
    data: { name: 'Test Item', status: 'pending' }
  });
  console.log(`Created item with ID: ${testItem.id}`);

  // Wait a moment for the notification
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('Updating item status...');
  await prisma.item.update({
    where: { id: testItem.id },
    data: { status: 'completed' }
  });

  // Wait a moment for the notification
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('Creating test list...');
  const testList = await prisma.list.create({
    data: { name: 'Test List' }
  });

  // Wait a moment for the notification
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('Creating test UwU...');
  const testUwU = await prisma.uwU.create({
    data: { what: 'Test UwU' }
  });

  // Wait a moment for the notification
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Simulate a custom payment event (you would trigger this from your payment processing code)
  // For demo purposes, we'll manually trigger the notification
  console.log('Simulating payment event...');
  // In real usage, this would be triggered by a payment processor or another part of your system
  // that calls a function which sends to the payment_events channel

  // Clean up
  console.log('Cleaning up...');
  await prisma.item.delete({ where: { id: testItem.id } });
  await prisma.list.delete({ where: { id: testList.id } });
  await prisma.uwU.delete({ where: { id: testUwU.id } });

  // Stop listening
  await registry.stopListening();

  console.log('Demo complete!');
}

main().catch(console.error);
