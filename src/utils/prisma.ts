// src/utils/prisma.ts
import { Prisma } from '@prisma/client';

/**
 * Gets the actual database table name for a Prisma model
 */
export function getTableName(modelName: string): string {
  try {
    // Access datamodel from Prisma's exported DMMF
    const datamodel = Prisma.dmmf.datamodel;

    // Find the model by name (case-insensitive)
    const model = datamodel.models.find(
      (m) => m.name.toLowerCase() === modelName.toLowerCase()
    );

    if (model) {
      // Return dbName if available, otherwise return the model name
      return model.dbName || model.name;
    }
  } catch (error) {
    console.warn(
      `Could not get table name for ${modelName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Fallback to first-letter capitalization
  return modelName.charAt(0).toUpperCase() + modelName.slice(1);
}

/**
 * Gets all field names for a given model
 */
export function getModelFields(modelName: string): string[] {
  try {
    // Access datamodel from Prisma's exported DMMF
    const datamodel = Prisma.dmmf.datamodel;

    // Find the model by name (case-insensitive)
    const model = datamodel.models.find(
      (m) => m.name.toLowerCase() === modelName.toLowerCase()
    );

    if (model?.fields) {
      return model.fields.map((f) => f.name);
    }
  } catch (error) {
    console.warn(
      `Could not get fields for ${modelName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Empty fallback
  return [];
}
