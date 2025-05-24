// src/core/conditions.ts
import { ModelName, ModelField, ModelRecord, FieldType } from '../types';

export type ConditionSQL = string & { _brand: 'ConditionSQL' };

export interface Condition {
  toSQL(): ConditionSQL;
}

// Field reference that's properly typed
// src/core/conditions.ts
export class FieldRef<
  Client,
  M extends ModelName<Client>,
  F extends ModelField<Client, M>
> {
  constructor(
    private record: 'NEW' | 'OLD',
    private field: F,
    private _phantom?: FieldType<Client, M, F> // For type inference
  ) {}

  eq(value: FieldType<Client, M, F>): Comparison<Client, M, F> {
    return new Comparison(this, '=', value);
  }

  ne(value: FieldType<Client, M, F>): Comparison<Client, M, F> {
    return new Comparison(this, '<>', value);
  }

  gt(
    value: FieldType<Client, M, F> extends number
      ? FieldType<Client, M, F>
      : never
  ): Comparison<Client, M, F> {
    return new Comparison(this, '>', value);
  }

  gte(
    value: FieldType<Client, M, F> extends number
      ? FieldType<Client, M, F>
      : never
  ): Comparison<Client, M, F> {
    return new Comparison(this, '>=', value);
  }

  lt(
    value: FieldType<Client, M, F> extends number
      ? FieldType<Client, M, F>
      : never
  ): Comparison<Client, M, F> {
    return new Comparison(this, '<', value);
  }

  lte(
    value: FieldType<Client, M, F> extends number
      ? FieldType<Client, M, F>
      : never
  ): Comparison<Client, M, F> {
    return new Comparison(this, '<=', value);
  }

  like(
    value: FieldType<Client, M, F> extends string ? string : never
  ): Comparison<Client, M, F> {
    return new Comparison(this, 'LIKE', value);
  }

  in(values: FieldType<Client, M, F>[]): Comparison<Client, M, F> {
    return new Comparison(this, 'IN', values);
  }

  isNull(): Comparison<Client, M, F> {
    return new Comparison(this, 'IS', null);
  }

  isNotNull(): Comparison<Client, M, F> {
    return new Comparison(this, 'IS NOT', null);
  }

  toSQL(): string {
    return `${this.record}."${String(this.field)}"`;
  }
}

class Comparison<
  Client,
  M extends ModelName<Client>,
  F extends ModelField<Client, M>
> implements Condition
{
  constructor(
    private field: FieldRef<Client, M, F>,
    private op: string,
    private value: any
  ) {}

  toSQL(): ConditionSQL {
    const fieldSQL = this.field.toSQL();

    if (this.value === null) {
      return `${fieldSQL} ${this.op} NULL` as ConditionSQL;
    }

    if (this.value instanceof FieldRef) {
      return `${fieldSQL} ${this.op} ${this.value.toSQL()}` as ConditionSQL;
    }

    if (this.op === 'IN' || this.op === 'NOT IN') {
      const values = (this.value as any[])
        .map((v) => this.escape(v))
        .join(', ');
      return `${fieldSQL} ${this.op} (${values})` as ConditionSQL;
    }

    return `${fieldSQL} ${this.op} ${this.escape(this.value)}` as ConditionSQL;
  }

  private escape(value: any): string {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    return String(value);
  }
}

// Condition builder that requires context
export class ConditionBuilder<Client, M extends ModelName<Client>> {
  NEW<F extends ModelField<Client, M>>(field: F): FieldRef<Client, M, F> {
    return new FieldRef('NEW', field);
  }

  OLD<F extends ModelField<Client, M>>(field: F): FieldRef<Client, M, F> {
    return new FieldRef('OLD', field);
  }

  and(...conditions: Condition[]): Condition {
    return {
      toSQL: () =>
        conditions.map((c) => `(${c.toSQL()})`).join(' AND ') as ConditionSQL
    };
  }

  or(...conditions: Condition[]): Condition {
    return {
      toSQL: () =>
        conditions.map((c) => `(${c.toSQL()})`).join(' OR ') as ConditionSQL
    };
  }

  changed<F extends ModelField<Client, M>>(field: F): Condition {
    return {
      toSQL: () =>
        `NEW."${String(field)}" IS DISTINCT FROM OLD."${String(
          field
        )}"` as ConditionSQL
    };
  }
}

// Factory that creates a typed condition builder
export function createConditions<
  Client,
  M extends ModelName<Client>
>(): ConditionBuilder<Client, M> {
  return new ConditionBuilder<Client, M>();
}

// For SQL templates - just use string since full type safety would require parsing SQL
export function sql(strings: TemplateStringsArray, ...values: any[]): string {
  let result = strings[0];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (value === null || value === undefined) {
      result += 'NULL';
    } else if (typeof value === 'string') {
      result += `'${value.replace(/'/g, "''")}'`;
    } else if (typeof value === 'boolean') {
      result += value ? 'TRUE' : 'FALSE';
    } else if (value instanceof Date) {
      result += `'${value.toISOString()}'::timestamp`;
    } else if (Array.isArray(value)) {
      result +=
        '(' +
        value
          .map((v) =>
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v)
          )
          .join(', ') +
        ')';
    } else {
      result += String(value);
    }

    result += strings[i + 1];
  }

  return result;
}
