"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConditionBuilder = void 0;
exports.buildWhereCondition = buildWhereCondition;
/**
 * Converts simple field comparisons to SQL WHERE conditions
 *
 * @template Client - The Prisma client type
 * @template M - The model name
 * @param modelName - The model name
 * @param condition - A function that defines the condition using NEW and OLD records
 * @returns SQL string for the condition
 */
function buildWhereCondition(modelName, condition) {
    // This is a simple implementation that uses function stringification
    // to extract field comparisons
    const conditionStr = condition.toString();
    // Extract the relevant part of the function (the comparison expression)
    const body = conditionStr
        .replace(/^.*=>/, '') // Remove everything before =>
        .replace(/^\s*{\s*return\s*|\s*}\s*$/g, '') // Remove { return ... } if present
        .trim();
    // Basic translation patterns from JS to SQL
    const sqlCondition = body
        // Handle field access (NEW.field, OLD.field)
        .replace(/NEW\.(\w+)/g, 'NEW."$1"')
        .replace(/OLD\.(\w+)/g, 'OLD."$1"')
        // Handle common operators
        .replace(/===|==/g, '=')
        .replace(/!==|!=/g, '<>')
        .replace(/&&/g, 'AND')
        .replace(/\|\|/g, 'OR')
        // Handle Prisma-style .equals() and other methods
        .replace(/\.equals\(([^)]+)\)/g, ' = $1')
        .replace(/\.gt\(([^)]+)\)/g, ' > $1')
        .replace(/\.gte\(([^)]+)\)/g, ' >= $1')
        .replace(/\.lt\(([^)]+)\)/g, ' < $1')
        .replace(/\.lte\(([^)]+)\)/g, ' <= $1')
        .replace(/\.not\(([^)]+)\)/g, ' <> $1')
        .replace(/\.contains\(([^)]+)\)/g, " LIKE '%' || $1 || '%'")
        .replace(/\.startsWith\(([^)]+)\)/g, " LIKE $1 || '%'")
        .replace(/\.endsWith\(([^)]+)\)/g, " LIKE '%' || $1");
    return sqlCondition;
}
/**
 * A more structured way to define conditions - for complex cases
 */
class ConditionBuilder {
    constructor() {
        this.conditions = [];
    }
    /**
     * Creates field different condition
     *
     * @param field - The field to compare
     * @returns The condition builder for chaining
     */
    fieldChanged(field) {
        this.conditions.push(`NEW."${String(field)}" IS DISTINCT FROM OLD."${String(field)}"`);
        return this;
    }
    /**
     * Creates a condition comparing NEW to a value
     *
     * @param field - The field to compare
     * @param operator - The comparison operator
     * @param value - The value to compare against
     * @returns The condition builder for chaining
     */
    where(field, operator, value) {
        // Handle different value types
        let sqlValue;
        if (typeof value === 'string') {
            sqlValue = `'${value.replace(/'/g, "''")}'`; // Escape single quotes
        }
        else if (value === null) {
            sqlValue = 'NULL';
        }
        else {
            sqlValue = String(value);
        }
        this.conditions.push(`NEW."${String(field)}" ${operator} ${sqlValue}`);
        return this;
    }
    /**
     * Creates a condition comparing NEW to OLD
     *
     * @param field - The field to compare
     * @param operator - The comparison operator
     * @returns The condition builder for chaining
     */
    compareFields(field, operator) {
        this.conditions.push(`NEW."${String(field)}" ${operator} OLD."${String(field)}"`);
        return this;
    }
    /**
     * Combines all conditions with AND
     *
     * @returns SQL string for the condition
     */
    build() {
        return this.conditions.join(' AND ');
    }
    /**
     * Combines all conditions with OR
     *
     * @returns SQL string for the condition
     */
    buildOr() {
        return this.conditions.join(' OR ');
    }
}
exports.ConditionBuilder = ConditionBuilder;
