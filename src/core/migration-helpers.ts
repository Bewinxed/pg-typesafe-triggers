// src/core/migration-helpers.ts
import postgres from 'postgres';
import { ConnectionManager } from './connection-manager';
import { TriggerConfiguration } from '../types/core-extended';

export interface TriggerInfo {
  name: string;
  table: string;
  timing: string;
  events: string[];
  function: string;
  condition?: string;
  columns?: string[];
  forEach: string;
  enabled: boolean;
  definition: string;
}

export interface MigrationSQL {
  up: string;
  down: string;
  checksum: string;
}

export interface DiffResult {
  added: TriggerConfiguration[];
  removed: TriggerInfo[];
  modified: Array<{
    current: TriggerInfo;
    desired: TriggerConfiguration;
    changes: string[];
  }>;
}

export class MigrationHelper {
  constructor(
    private connectionManager: ConnectionManager,
    private namespace: string = 'pg_typesafe_triggers'
  ) {}

  /**
   * Introspect all triggers in the database
   */
  async introspect(schema: string = 'public'): Promise<TriggerInfo[]> {
    const sql = this.connectionManager.getTransactionConnection();

    const triggers = await sql<TriggerInfo[]>`
      SELECT 
        t.tgname as name,
        c.relname as table,
        CASE 
          WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
          WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END as timing,
        ARRAY(
          SELECT CASE
            WHEN t.tgtype & 4 = 4 THEN 'INSERT'
            WHEN t.tgtype & 8 = 8 THEN 'DELETE'
            WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
            WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE'
          END
          WHERE (t.tgtype & 60) > 0
        ) as events,
        p.proname as function,
        pg_get_triggerdef(t.oid) as definition,
        CASE 
          WHEN t.tgtype & 1 = 1 THEN 'ROW'
          ELSE 'STATEMENT'
        END as "forEach",
        t.tgenabled = 'O' as enabled
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE n.nspname = ${schema}
        AND NOT t.tgisinternal
        AND c.relkind = 'r'
      ORDER BY c.relname, t.tgname
    `;

    // Parse additional details from definition
    return triggers.map((trigger) => {
      const conditionMatch = trigger.definition.match(/WHEN \((.+?)\)/);
      const columnsMatch = trigger.definition.match(/OF (.+?) ON/);

      return {
        ...trigger,
        condition: conditionMatch?.[1],
        columns: columnsMatch?.[1]?.split(', ').map((c) => c.trim())
      };
    });
  }

  /**
   * Generate migration SQL for a set of trigger configurations
   */
  async generateMigration(
    triggers: TriggerConfiguration[]
  ): Promise<MigrationSQL> {
    const upStatements: string[] = [];
    const downStatements: string[] = [];

    // Group triggers by function to create functions first
    const functionMap = new Map<string, Set<string>>();

    for (const trigger of triggers) {
      const funcName =
        trigger.functionName || `${trigger.modelName}_notify_func`;
      if (!functionMap.has(funcName)) {
        functionMap.set(funcName, new Set());
      }
      functionMap.get(funcName)!.add(trigger.channelName || trigger.modelName);
    }

    // Generate function creation SQL
    for (const [funcName, channels] of functionMap) {
      const channel = Array.from(channels)[0]; // Primary channel

      upStatements.push(
        `
-- Create notification function: ${funcName}
CREATE OR REPLACE FUNCTION ${funcName}()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  channel TEXT := '${channel}';
BEGIN
  -- Build payload based on operation
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    payload = to_jsonb(NEW);
  ELSEIF TG_OP = 'DELETE' THEN
    payload = to_jsonb(OLD);
  END IF;

  -- Send notification
  PERFORM pg_notify(channel, jsonb_build_object(
    'operation', TG_OP,
    'timestamp', NOW(),
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'data', payload
  )::TEXT);
  
  -- Return appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
      `.trim()
      );

      downStatements.push(`DROP FUNCTION IF EXISTS ${funcName}();`);
    }

    // Generate trigger creation SQL
    for (const trigger of triggers) {
      const sql = this.buildTriggerSQL(trigger);
      upStatements.push(`\n-- Create trigger: ${trigger.triggerName}\n${sql}`);
      downStatements.push(
        `DROP TRIGGER IF EXISTS "${trigger.triggerName}" ON "${trigger.tableName}";`
      );
    }

    const up = upStatements.join('\n\n');
    const down = downStatements.reverse().join('\n');
    const checksum = await this.generateChecksum(up);

    return { up, down, checksum };
  }

  /**
   * Compare current state with desired state
   */
  async diff(desired: TriggerConfiguration[]): Promise<DiffResult> {
    const current = await this.introspect();

    const currentMap = new Map(current.map((t) => [`${t.table}.${t.name}`, t]));
    const desiredMap = new Map(
      desired.map((t) => [`${t.tableName}.${t.triggerName}`, t])
    );

    const added: TriggerConfiguration[] = [];
    const removed: TriggerInfo[] = [];
    const modified: DiffResult['modified'] = [];

    // Find added and modified triggers
    for (const [key, config] of desiredMap) {
      const currentTrigger = currentMap.get(key);

      if (!currentTrigger) {
        added.push(config);
      } else {
        const changes = this.detectChanges(currentTrigger, config);
        if (changes.length > 0) {
          modified.push({ current: currentTrigger, desired: config, changes });
        }
        currentMap.delete(key);
      }
    }

    // Remaining triggers in currentMap are removed
    removed.push(...currentMap.values());

    return { added, removed, modified };
  }

  /**
   * Sync triggers to match desired state
   */
  async sync(
    desired: TriggerConfiguration[],
    options: { dryRun?: boolean; force?: boolean } = {}
  ): Promise<string[]> {
    const diff = await this.diff(desired);
    const statements: string[] = [];

    if (diff.removed.length > 0 && !options.force) {
      throw new Error(
        `Found ${diff.removed.length} triggers to remove. Use force: true to proceed.`
      );
    }

    // Remove triggers
    for (const trigger of diff.removed) {
      statements.push(
        `DROP TRIGGER IF EXISTS "${trigger.name}" ON "${trigger.table}";`
      );
    }

    // Modify triggers (drop and recreate)
    for (const { current, desired } of diff.modified) {
      statements.push(
        `DROP TRIGGER IF EXISTS "${current.name}" ON "${current.table}";`
      );
      statements.push(this.buildTriggerSQL(desired));
    }

    // Add new triggers
    for (const trigger of diff.added) {
      statements.push(this.buildTriggerSQL(trigger));
    }

    if (!options.dryRun && statements.length > 0) {
      const sql = this.connectionManager.getTransactionConnection();
      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
      });
    }

    return statements;
  }

  /**
   * Generate SQL to save trigger metadata
   */
  async saveMetadata(triggers: TriggerConfiguration[]): Promise<void> {
    const sql = this.connectionManager.getTransactionConnection();

    // Create metadata table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS ${sql(this.namespace + '_metadata')} (
        id SERIAL PRIMARY KEY,
        trigger_name TEXT NOT NULL,
        table_name TEXT NOT NULL,
        configuration JSONB NOT NULL,
        checksum TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(trigger_name, table_name)
      )
    `;

    // Save trigger configurations
    for (const trigger of triggers) {
      const checksum = await this.generateChecksum(JSON.stringify(trigger));

      await sql`
        INSERT INTO ${sql(this.namespace + '_metadata')} 
          (trigger_name, table_name, configuration, checksum)
        VALUES 
          (${trigger.triggerName}, ${trigger.tableName}, ${JSON.stringify(
        trigger
      )}, ${checksum})
        ON CONFLICT (trigger_name, table_name) 
        DO UPDATE SET 
          configuration = EXCLUDED.configuration,
          checksum = EXCLUDED.checksum,
          updated_at = NOW()
      `;
    }
  }

  /**
   * Load saved trigger configurations
   */
  async loadMetadata(): Promise<TriggerConfiguration[]> {
    const sql = this.connectionManager.getTransactionConnection();

    try {
      const rows = await sql<{ configuration: TriggerConfiguration }[]>`
        SELECT configuration 
        FROM ${sql(this.namespace + '_metadata')}
        ORDER BY table_name, trigger_name
      `;

      return rows.map((row) => row.configuration);
    } catch (error) {
      // Table might not exist
      return [];
    }
  }

  private buildTriggerSQL(config: TriggerConfiguration): string {
    let sql = `CREATE TRIGGER "${config.triggerName}"\n`;
    sql += `${config.timing} ${config.events.join(' OR ')}\n`;

    if (config.updateOfColumns?.length) {
      sql += `OF ${config.updateOfColumns
        .map((c: string) => `"${c}"`)
        .join(', ')}\n`;
    }

    sql += `ON "${config.tableName}"\n`;
    sql += `FOR EACH ${config.forEach || 'ROW'}\n`;

    if (config.whenCondition) {
      sql += `WHEN (${config.whenCondition})\n`;
    }

    sql += `EXECUTE FUNCTION ${config.functionName}(${
      config.functionArgs?.join(', ') || ''
    });`;

    return sql;
  }

  private detectChanges(
    current: TriggerInfo,
    desired: TriggerConfiguration
  ): string[] {
    const changes: string[] = [];

    if (current.timing !== desired.timing) {
      changes.push(`timing: ${current.timing} → ${desired.timing}`);
    }

    const currentEvents = new Set(current.events);
    const desiredEvents = new Set(desired.events);
    if (!this.setsEqual(currentEvents, desiredEvents)) {
      changes.push(
        `events: ${current.events.join(',')} → ${desired.events.join(',')}`
      );
    }

    if (current.condition !== desired.whenCondition) {
      changes.push('condition changed');
    }

    if (current.function !== desired.functionName) {
      changes.push(`function: ${current.function} → ${desired.functionName}`);
    }

    return changes;
  }

  private setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  private async generateChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
