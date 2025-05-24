// examples/usage.ts

import { PrismaClient } from '@prisma/client';
import { createTriggers, sql } from '../src'; // Adjust the import path as needed

const triggers = createTriggers<PrismaClient>(process.env.DATABASE_URL!);

// Type-safe usage - TypeScript infers everything from context
// Type-safe with your actual schema
const itemTrigger = triggers.create({
  model: 'item',
  timing: 'AFTER',
  events: ['UPDATE'],
  forEach: 'ROW',
  functionName: 'item_status_fn',
  when: (c) => c.NEW('status').ne(c.OLD('status')), // status is string
  notify: 'item_changes'
});

// This would give a TypeScript error:
// c.NEW('name').gt(1000) // Error: gt() expects never because 'name' is string, not number

// Complex example with proper types
const complexTrigger = triggers.create({
  model: 'item',
  timing: 'AFTER',
  events: ['UPDATE'],
  forEach: 'ROW',
  functionName: 'item_complex_fn',
  when: (c) =>
    c.and(
      c.NEW('status').eq('active'),
      c.OLD('status').ne('active'),
      c.changed('name')
    ),
  notify: 'item_activations'
});

// UwU model example
const uwuTrigger = triggers.create({
  model: 'uwU',
  timing: 'AFTER',
  events: ['INSERT'],
  forEach: 'ROW',
  functionName: 'uwu_insert_fn',
  when: (c) => c.NEW('what').like('%owo%'),
  notify: 'uwu_events'
});
