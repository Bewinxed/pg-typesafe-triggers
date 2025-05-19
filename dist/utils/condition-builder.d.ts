import { ModelName, ModelField } from '../types/core';
/**
 * Type for a condition evaluator function
 */
export type ConditionEvaluator<Client, M extends ModelName<Client>> = (records: {
    NEW: Record<ModelField<Client, M>, any>;
    OLD: Record<ModelField<Client, M>, any>;
}) => boolean;
/**
 * Converts simple field comparisons to SQL WHERE conditions
 *
 * @template Client - The Prisma client type
 * @template M - The model name
 * @param modelName - The model name
 * @param condition - A function that defines the condition using NEW and OLD records
 * @returns SQL string for the condition
 */
export declare function buildWhereCondition<Client, M extends ModelName<Client>>(modelName: M, condition: ConditionEvaluator<Client, M>): string;
/**
 * A more structured way to define conditions - for complex cases
 */
export declare class ConditionBuilder<Client, M extends ModelName<Client>> {
    private conditions;
    /**
     * Creates field different condition
     *
     * @param field - The field to compare
     * @returns The condition builder for chaining
     */
    fieldChanged(field: ModelField<Client, M>): ConditionBuilder<Client, M>;
    /**
     * Creates a condition comparing NEW to a value
     *
     * @param field - The field to compare
     * @param operator - The comparison operator
     * @param value - The value to compare against
     * @returns The condition builder for chaining
     */
    where(field: ModelField<Client, M>, operator: '=' | '<>' | '>' | '>=' | '<' | '<=' | 'LIKE', value: unknown): ConditionBuilder<Client, M>;
    /**
     * Creates a condition comparing NEW to OLD
     *
     * @param field - The field to compare
     * @param operator - The comparison operator
     * @returns The condition builder for chaining
     */
    compareFields(field: ModelField<Client, M>, operator: '=' | '<>' | '>' | '>=' | '<' | '<='): ConditionBuilder<Client, M>;
    /**
     * Combines all conditions with AND
     *
     * @returns SQL string for the condition
     */
    build(): string;
    /**
     * Combines all conditions with OR
     *
     * @returns SQL string for the condition
     */
    buildOr(): string;
}
