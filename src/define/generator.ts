// src/define/generator.ts
import { ModelName, ModelField, DefineTriggerOptions } from '../types/core';

/**
 * Generates SQL statements for creating database triggers
 */
export class TriggerSQLGenerator<Client> {
  /**
   * Generates a CREATE TRIGGER SQL statement from the provided options
   *
   * @param options - Options for defining the trigger
   * @returns The SQL string for creating the trigger
   */
  public generateCreateTriggerSQL<M extends ModelName<Client>>(
    options: DefineTriggerOptions<Client, M>
  ): string {
    // Extract options including tableName
    const {
      tableName,
      triggerName,
      timing,
      events,
      forEach = 'ROW',
      updateOfColumns,
      whenCondition,
      functionName,
      functionArgs = []
    } = options;

    // SQL generation code
    let sql = `CREATE OR REPLACE TRIGGER "${triggerName}"\n`;
    sql += `${timing} `;
    sql += events.join(' OR ') + ' ';

    // Add columns if needed
    if (
      events.includes('UPDATE') &&
      updateOfColumns &&
      updateOfColumns.length > 0
    ) {
      sql += `OF ${updateOfColumns.map((col) => `"${col}"`).join(', ')} `;
    }

    // Use the tableName from options (retrieved from DMMF)
    sql += `ON "${tableName}"\n`;

    // Rest of SQL generation
    sql += `FOR EACH ${forEach}\n`;
    if (whenCondition) {
      sql += `WHEN (${whenCondition})\n`;
    }
    sql += `EXECUTE FUNCTION ${functionName}(${functionArgs.join(', ')});`;

    console.log('Generated SQL:', sql);
    return sql;
  }

  /**
   * Generates a DROP TRIGGER SQL statement
   *
   * @param modelName - The Prisma model (table) name
   * @param triggerName - The name of the trigger to drop
   * @returns The SQL string for dropping the trigger
   */
  public generateDropTriggerSQL(
    tableName: string,
    triggerName: string
  ): string {
    return `DROP TRIGGER IF EXISTS "${triggerName}" ON "${tableName}";`;
  }

  /**
   * Generates a template for a PL/pgSQL function that sends notifications
   *
   * @param functionName - The name of the function
   * @param channelName - The notification channel name
   * @returns The SQL string for creating the function
   */
  public generateNotifyFunctionSQL(
    functionName: string,
    channelName: string
  ): string {
    return `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  -- For INSERT or UPDATE, NEW record is usually available
  -- For DELETE, OLD record is usually available
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    payload = to_jsonb(NEW);
  ELSEIF TG_OP = 'DELETE' THEN
    payload = to_jsonb(OLD);
  END IF;

  PERFORM pg_notify('${channelName}', jsonb_build_object(
    'operation', TG_OP,
    'timestamp', NOW(),
    'data', payload
  )::TEXT);
  
  -- Return value depends on trigger timing and operation
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
`;
  }
}
