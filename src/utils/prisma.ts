// src/utils/prisma-dmmf.ts
import { Prisma } from '@prisma/client';

/**
 * Interface for accessing Prisma's internal DMMF
 */
interface PrismaDMMF {
  datamodel: {
    models: Array<{
      name: string;
      dbName?: string | null;
      fields: Array<{
        name: string;
        type: string;
        kind: string;
        isRequired: boolean;
        dbName?: string | null;
      }>;
    }>;
  };
}

/**
 * Gets the actual database table name for a Prisma model
 * Handles @map directives in Prisma schema
 */
export function getTableName(modelName: string, prismaClient?: any): string {
  try {
    // Try to use Prisma namespace which should have DMMF
    const dmmf = (Prisma as any).dmmf as PrismaDMMF;

    if (!dmmf?.datamodel?.models) {
      console.warn('Could not access Prisma DMMF');
      // Without DMMF access, we can't determine the actual table name
      // The user should provide the correct table name or ensure DMMF is accessible
      return modelName;
    }

    // Find the model by name (case-sensitive first, then case-insensitive)
    let model = dmmf.datamodel.models.find((m) => m.name === modelName);
    
    if (!model) {
      // Fallback to case-insensitive search
      model = dmmf.datamodel.models.find(
        (m) => m.name.toLowerCase() === modelName.toLowerCase()
      );
    }

    if (model) {
      // Return dbName if available (from @map directive), otherwise return the model name
      return model.dbName || model.name;
    }
  } catch (error) {
    console.warn(
      `Could not get table name for ${modelName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Fallback to the model name
  return modelName;
}

/**
 * Gets all field names for a given model
 */
export function getModelFields(modelName: string): string[] {
  try {
    const dmmf = (Prisma as any).dmmf as PrismaDMMF;

    if (!dmmf?.datamodel?.models) {
      return [];
    }

    let model = dmmf.datamodel.models.find((m) => m.name === modelName);
    
    if (!model) {
      // Fallback to case-insensitive search
      model = dmmf.datamodel.models.find(
        (m) => m.name.toLowerCase() === modelName.toLowerCase()
      );
    }

    if (model?.fields) {
      return model.fields
        .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
        .map((f) => f.name);
    }
  } catch (error) {
    console.warn(
      `Could not get fields for ${modelName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return [];
}

/**
 * Gets the actual database column name for a field
 * Handles @map directives on fields
 */
export function getColumnName(modelName: string, fieldName: string): string {
  try {
    const dmmf = (Prisma as any).dmmf as PrismaDMMF;

    if (!dmmf?.datamodel?.models) {
      return fieldName;
    }

    let model = dmmf.datamodel.models.find((m) => m.name === modelName);
    
    if (!model) {
      // Fallback to case-insensitive search
      model = dmmf.datamodel.models.find(
        (m) => m.name.toLowerCase() === modelName.toLowerCase()
      );
    }

    if (model?.fields) {
      const field = model.fields.find(
        (f) => f.name.toLowerCase() === fieldName.toLowerCase()
      );

      if (field) {
        return field.dbName || field.name;
      }
    }
  } catch (error) {
    console.warn(
      `Could not get column name for ${modelName}.${fieldName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return fieldName;
}
