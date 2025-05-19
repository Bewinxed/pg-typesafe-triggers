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
    const {
      modelName,
      triggerName,
      timing,
      events,
      forEach = 'ROW',
      updateOfColumns,
      whenCondition,
      functionName,
      functionArgs = []
    } = options;

    // Start building the SQL statement
    let sql = `CREATE OR REPLACE TRIGGER "${triggerName}"\n`;
    sql += `${timing} `;

    // Add events (e.g., INSERT, UPDATE, DELETE)
    sql += events.join(' OR ') + ' ';

    // Add updateOfColumns for UPDATE events if specified
    if (
      events.includes('UPDATE') &&
      updateOfColumns &&
      updateOfColumns.length > 0
    ) {
      sql += `OF ${updateOfColumns.map((col) => `"${col}"`).join(', ')} `;
    }

    // Add table name - IMPORTANT: Preserve the exact case of the model name
    sql += `ON "${modelName.slice(0, 1).toUpperCase() + modelName.slice(1)}"\n`;

    // Add FOR EACH ROW/STATEMENT
    sql += `FOR EACH ${forEach}\n`;

    // Add WHEN condition if specified
    if (whenCondition) {
      sql += `WHEN (${whenCondition})\n`;
    }

    // Add EXECUTE FUNCTION with arguments
    sql += `EXECUTE FUNCTION ${functionName}(${functionArgs.join(', ')});`;

    // Log the generated SQL for debugging
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
  public generateDropTriggerSQL<M extends ModelName<Client>>(
    modelName: M,
    triggerName: string
  ): string {
    return `DROP TRIGGER IF EXISTS "${triggerName}" ON "${modelName}";`;
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
