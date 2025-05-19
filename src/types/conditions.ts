// src/types/conditions.ts
import { Prisma } from '@prisma/client';
import { PrismaModelName, ModelField } from './core';

/**
 * Comparison operators for field values
 */
export type ComparisonOperator =
  | 'equals'
  | 'not'
  | 'in'
  | 'notIn'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'startsWith'
  | 'endsWith';

/**
 * Value comparison for a field
 */
export type ValueComparison = {
  [key in ComparisonOperator]?: any;
} & {
  changed?: boolean;
};

/**
 * Typesafe condition for NEW record values
 */
export type NewValueCondition<T extends PrismaModelName> = {
  [key in ModelField<T>]?: ValueComparison | any;
} & {
  AND?: NewValueCondition<T>[];
  OR?: NewValueCondition<T>[];
  NOT?: NewValueCondition<T>;
};

/**
 * Typesafe condition for OLD record values
 */
export type OldValueCondition<T extends PrismaModelName> = {
  [key in ModelField<T>]?: ValueComparison | any;
} & {
  AND?: OldValueCondition<T>[];
  OR?: OldValueCondition<T>[];
  NOT?: OldValueCondition<T>;
};

/**
 * Combined condition for comparing OLD and NEW records
 */
export type TriggerCondition<T extends PrismaModelName> = {
  OLD?: OldValueCondition<T>;
  NEW?: NewValueCondition<T>;
  CHANGED?: ModelField<T>[];
  AND?: TriggerCondition<T>[];
  OR?: TriggerCondition<T>[];
  NOT?: TriggerCondition<T>;
};
