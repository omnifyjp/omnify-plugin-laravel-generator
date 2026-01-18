/**
 * @famgia/omnify-laravel - Schema Builder Converter
 *
 * Converts SQL types and operations to Laravel Schema Builder methods.
 */

import type { PropertyDefinition, LoadedSchema, SchemaCollection, CustomTypeDefinition, LocalizedString, LocaleResolutionOptions, PluginEnumDefinition } from '@famgia/omnify-types';
import { resolveLocalizedString } from '@famgia/omnify-types';
import type {
  ColumnMethod,
  ColumnModifier,
  ForeignKeyDefinition,
  IndexDefinition,
  TableBlueprint,
} from './types.js';
import { singularize } from '../utils.js';

/**
 * Maps Omnify property types to Laravel column methods.
 */
const TYPE_METHOD_MAP: Record<string, string> = {
  String: 'string',
  TinyInt: 'tinyInteger',
  Int: 'integer',
  BigInt: 'bigInteger',
  Float: 'double',
  Decimal: 'decimal',
  Boolean: 'boolean',
  Text: 'text',
  MediumText: 'mediumText',
  LongText: 'longText',
  Date: 'date',
  Time: 'time',
  DateTime: 'dateTime',
  Timestamp: 'timestamp',
  Json: 'json',
  Email: 'string',
  Password: 'string',
  Enum: 'enum',
  EnumRef: 'string', // EnumRef stores the enum value as string (lookup via schema)
  // Note: File type is now polymorphic - no column generated, uses files table
};

/**
 * Maps primary key types to Laravel methods.
 * Laravel 8+ uses id() for BigInt auto-increment primary keys.
 */
const PK_METHOD_MAP: Record<string, string> = {
  Int: 'increments',
  BigInt: 'id',
  Uuid: 'uuid',
  String: 'string',
};

/**
 * Gets the ID type from schema options.
 */
function getIdType(schema: LoadedSchema): 'Int' | 'BigInt' | 'Uuid' | 'String' {
  return (schema.options?.idType ?? 'BigInt') as 'Int' | 'BigInt' | 'Uuid' | 'String';
}

/**
 * Checks if the schema should have an auto-generated ID column.
 * Returns false if options.id is explicitly set to false.
 */
function hasAutoId(schema: LoadedSchema): boolean {
  return schema.options?.id !== false;
}

/**
 * Converts a property name to snake_case column name.
 */
export function toColumnName(propertyName: string): string {
  return propertyName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Converts schema name to snake_case plural table name.
 */
export function toTableName(schemaName: string): string {
  const snakeCase = schemaName
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');

  // Simple pluralization
  if (snakeCase.endsWith('y')) {
    return snakeCase.slice(0, -1) + 'ies';
  } else if (
    snakeCase.endsWith('s') ||
    snakeCase.endsWith('x') ||
    snakeCase.endsWith('ch') ||
    snakeCase.endsWith('sh')
  ) {
    return snakeCase + 'es';
  } else {
    return snakeCase + 's';
  }
}

/**
 * Options for property to column conversion.
 */
export interface PropertyToColumnOptions {
  /** Locale resolution options for displayName */
  locale?: LocaleResolutionOptions;
}

/**
 * Converts a property to Laravel column method.
 */
export function propertyToColumnMethod(
  propertyName: string,
  property: PropertyDefinition,
  options: PropertyToColumnOptions = {}
): ColumnMethod | null {
  // Skip associations - they're handled separately
  if (property.type === 'Association') {
    return null;
  }

  // Skip File type - uses polymorphic relation to files table
  if (property.type === 'File') {
    return null;
  }

  const columnName = toColumnName(propertyName);
  const method = TYPE_METHOD_MAP[property.type] ?? 'string';
  const args: (string | number | boolean)[] = [columnName];
  const modifiers: ColumnModifier[] = [];

  // Handle length for string types
  const propWithLength = property as { length?: number };
  if (method === 'string' && propWithLength.length) {
    args.push(propWithLength.length);
  } else if (property.type === 'EnumRef') {
    // Default length for EnumRef columns (store enum value, typically short codes)
    args.push(50);
  }

  // Handle precision and scale for decimal types
  if (property.type === 'Decimal') {
    const decimalProp = property as { precision?: number; scale?: number };
    const precision = decimalProp.precision ?? 8;
    const scale = decimalProp.scale ?? 2;
    args.push(precision, scale);
  }

  // Handle enum values
  if (property.type === 'Enum') {
    const enumProp = property as { enum?: readonly string[] };
    if (enumProp.enum && enumProp.enum.length > 0) {
      args.push(enumProp.enum as unknown as string);
    }
  }

  // Add modifiers
  const baseProp = property as {
    nullable?: boolean;
    unique?: boolean;
    default?: unknown;
    unsigned?: boolean;
    primary?: boolean;
  };

  // Add primary key modifier (for custom primary keys with id: false)
  if (baseProp.primary) {
    modifiers.push({ method: 'primary' });
  }

  if (baseProp.nullable) {
    modifiers.push({ method: 'nullable' });
  }

  if (baseProp.unique) {
    modifiers.push({ method: 'unique' });
  }

  if (baseProp.default !== undefined && baseProp.default !== null) {
    // Keep native types for proper PHP rendering (boolean false vs string 'false')
    modifiers.push({ method: 'default', args: [baseProp.default as string | number | boolean] });
  }

  if (baseProp.unsigned && (method === 'tinyInteger' || method === 'integer' || method === 'bigInteger')) {
    modifiers.push({ method: 'unsigned' });
  }

  // Timestamp modifiers: useCurrent and useCurrentOnUpdate
  if (method === 'timestamp') {
    const timestampProp = property as { useCurrent?: boolean; useCurrentOnUpdate?: boolean };
    if (timestampProp.useCurrent) {
      modifiers.push({ method: 'useCurrent' });
    }
    if (timestampProp.useCurrentOnUpdate) {
      modifiers.push({ method: 'useCurrentOnUpdate' });
    }
  }

  // Add comment from displayName if available (resolve LocalizedString to string)
  const rawDisplayName = (property as { displayName?: LocalizedString }).displayName;
  if (rawDisplayName) {
    const displayName = resolveLocalizedString(rawDisplayName, options.locale);
    if (displayName) {
      modifiers.push({ method: 'comment', args: [displayName] });
    }
  }

  return {
    name: columnName,
    method,
    args,
    modifiers,
  };
}

/**
 * Generates primary key column method.
 */
export function generatePrimaryKeyColumn(
  pkType: 'Int' | 'BigInt' | 'Uuid' | 'String' = 'BigInt'
): ColumnMethod {
  const method = PK_METHOD_MAP[pkType] ?? 'id';

  if (pkType === 'Uuid') {
    return {
      name: 'id',
      method: 'uuid',
      args: ['id'],
      modifiers: [{ method: 'primary' }],
    };
  }

  if (pkType === 'String') {
    return {
      name: 'id',
      method: 'string',
      args: ['id', 255],
      modifiers: [{ method: 'primary' }],
    };
  }

  // For Int/BigInt, use increments/id which auto-creates primary key
  // $table->id() needs no args, $table->increments('id') needs column name
  return {
    name: 'id',
    method,
    args: method === 'id' ? [] : ['id'],
    modifiers: [],
  };
}

/**
 * Generates timestamp columns.
 */
export function generateTimestampColumns(): ColumnMethod[] {
  return [
    {
      name: 'created_at',
      method: 'timestamp',
      args: ['created_at'],
      modifiers: [{ method: 'nullable' }],
    },
    {
      name: 'updated_at',
      method: 'timestamp',
      args: ['updated_at'],
      modifiers: [{ method: 'nullable' }],
    },
  ];
}

/**
 * Generates soft delete column.
 */
export function generateSoftDeleteColumn(): ColumnMethod {
  return {
    name: 'deleted_at',
    method: 'timestamp',
    args: ['deleted_at'],
    modifiers: [{ method: 'nullable' }],
  };
}

/**
 * Polymorphic column result with type enum and id column.
 */
export interface PolymorphicColumnsResult {
  typeColumn: ColumnMethod;
  idColumn: ColumnMethod;
  indexes: IndexDefinition[];
}

/**
 * Generates polymorphic columns for MorphTo relations.
 * Creates {name}_type (ENUM) and {name}_id columns.
 */
export function generatePolymorphicColumns(
  propertyName: string,
  property: PropertyDefinition,
  allSchemas: SchemaCollection
): PolymorphicColumnsResult | null {
  if (property.type !== 'Association') {
    return null;
  }

  const assocProp = property as {
    relation?: string;
    targets?: readonly string[];
    nullable?: boolean;
  };

  // Only handle MorphTo - it creates the type and id columns
  if (assocProp.relation !== 'MorphTo') {
    return null;
  }

  // Check if nullable is explicitly set (default: true for MorphTo)
  const isNullable = assocProp.nullable !== false;

  const targets = assocProp.targets;
  if (!targets || targets.length === 0) {
    return null;
  }

  const columnBaseName = toColumnName(propertyName);
  const typeColumnName = `${columnBaseName}_type`;
  const idColumnName = `${columnBaseName}_id`;

  // Generate ENUM type column with target schema names as values
  const typeColumn: ColumnMethod = {
    name: typeColumnName,
    method: 'enum',
    args: [typeColumnName, targets as unknown as string],
    modifiers: isNullable ? [{ method: 'nullable' }] : [],
  };

  // For polymorphic id, we need to determine the appropriate ID type among targets
  // Collect all ID types from targets to handle mixed scenarios
  const idTypes = new Set<string>();
  for (const targetName of targets) {
    const targetSchema = allSchemas[targetName];
    if (targetSchema) {
      const targetIdType = (targetSchema.options?.idType ?? 'BigInt') as string;
      idTypes.add(targetIdType);
    }
  }

  // Determine column method based on ID types:
  // - If ALL targets use same type → use that type's method
  // - If MIXED types (e.g., UUID + BigInt) → use string(36) to accommodate both
  let idMethod = 'unsignedBigInteger';
  let idArgs: (string | number)[] = [];

  if (idTypes.size === 1) {
    // All targets use the same ID type
    const singleType = [...idTypes][0];
    if (singleType === 'Uuid') {
      idMethod = 'string'; // UUID stored as 36-char string for compatibility
      idArgs = [idColumnName, 36];
    } else if (singleType === 'String') {
      idMethod = 'string';
      idArgs = [idColumnName, 255];
    } else if (singleType === 'Int') {
      idMethod = 'unsignedInteger';
      idArgs = [idColumnName];
    } else {
      // BigInt (default)
      idMethod = 'unsignedBigInteger';
      idArgs = [idColumnName];
    }
  } else if (idTypes.size > 1) {
    // Mixed ID types - use string(36) to accommodate UUIDs (longest type)
    // BigInt/Int values will be stored as numeric strings
    idMethod = 'string';
    idArgs = [idColumnName, 36];
  } else {
    // No targets found - default to BigInt
    idArgs = [idColumnName];
  }

  const idColumn: ColumnMethod = {
    name: idColumnName,
    method: idMethod,
    args: idArgs.length > 0 ? idArgs : [idColumnName],
    modifiers: isNullable ? [{ method: 'nullable' }] : [],
  };

  // Create composite index for faster polymorphic lookups
  const indexes: IndexDefinition[] = [
    {
      columns: [typeColumnName, idColumnName],
      unique: false,
    },
  ];

  return { typeColumn, idColumn, indexes };
}

/**
 * Generates foreign key column and constraint from association.
 */
export function generateForeignKey(
  propertyName: string,
  property: PropertyDefinition,
  allSchemas: SchemaCollection,
  options: PropertyToColumnOptions = {}
): { column: ColumnMethod; foreignKey: ForeignKeyDefinition; index: IndexDefinition } | null {
  if (property.type !== 'Association') {
    return null;
  }

  const assocProp = property as {
    relation?: string;
    target?: string;
    onDelete?: string;
    onUpdate?: string;
    mappedBy?: string;
    owningSide?: boolean;
    nullable?: boolean;
    default?: string | number;
    displayName?: LocalizedString;
  };

  // Only create FK column for ManyToOne and OneToOne (owning side)
  if (assocProp.relation !== 'ManyToOne' && assocProp.relation !== 'OneToOne') {
    return null;
  }

  // Skip inverse side (mappedBy means this is the inverse side)
  if (assocProp.mappedBy) {
    return null;
  }

  const columnName = toColumnName(propertyName) + '_id';
  const targetSchema = assocProp.target ? allSchemas[assocProp.target] : undefined;
  const targetTable = assocProp.target ? toTableName(assocProp.target) : 'unknown';
  const targetPkType = targetSchema ? getIdType(targetSchema) : 'BigInt';

  // Determine column method based on target PK type
  let method = 'unsignedBigInteger';
  if (targetPkType === 'Int') {
    method = 'unsignedInteger';
  } else if (targetPkType === 'Uuid') {
    method = 'uuid';
  } else if (targetPkType === 'String') {
    method = 'string';
  }

  // Build modifiers for the column
  const modifiers: ColumnModifier[] = [];

  // Add nullable only if explicitly set to true (consistent with other property types)
  if (assocProp.nullable === true) {
    modifiers.push({ method: 'nullable' });
  }

  // Add default if specified
  if (assocProp.default !== undefined && assocProp.default !== null) {
    modifiers.push({ method: 'default', args: [assocProp.default] });
  }

  // Add comment from displayName if available (resolve LocalizedString to string)
  if (assocProp.displayName) {
    const displayName = resolveLocalizedString(assocProp.displayName, options.locale);
    if (displayName) {
      modifiers.push({ method: 'comment', args: [displayName] });
    }
  }

  const column: ColumnMethod = {
    name: columnName,
    method,
    args: [columnName],
    modifiers,
  };

  const foreignKey: ForeignKeyDefinition = {
    columns: [columnName],
    references: 'id',
    on: [targetTable],
    onDelete: assocProp.onDelete ?? 'restrict',
    onUpdate: assocProp.onUpdate ?? 'cascade',
  };

  // Don't specify index name - let Laravel auto-generate unique names
  const index: IndexDefinition = {
    columns: [columnName],
    unique: false,
  };

  return { column, foreignKey, index };
}

/**
 * Compound type expansion options.
 */
interface CompoundTypeExpandOptions extends PropertyToColumnOptions {
  /** Plugin enums for resolving enumRef to actual enum values */
  pluginEnums?: ReadonlyMap<string, PluginEnumDefinition>;
}

/**
 * Expands compound type properties into multiple columns.
 * Returns the expanded properties or null if not a compound type.
 */
function expandCompoundType(
  propName: string,
  property: PropertyDefinition,
  customTypes: ReadonlyMap<string, CustomTypeDefinition>,
  options: CompoundTypeExpandOptions = {}
): { name: string; property: PropertyDefinition }[] | null {
  const typeDef = customTypes.get(property.type);

  if (!typeDef || !typeDef.compound || !typeDef.expand) {
    return null;
  }

  const expanded: { name: string; property: PropertyDefinition }[] = [];
  const baseProp = property as unknown as Record<string, unknown>;

  for (const field of typeDef.expand) {
    // Generate column name: propName + suffix (converted to snake_case)
    const suffixSnake = toColumnName(field.suffix);
    const columnName = `${propName}_${suffixSnake}`;

    // Build property definition
    const expandedProp: Record<string, unknown> = {
      type: 'String', // Default type, will be overridden by sql definition
    };

    // Check for per-field overrides from schema's `fields` property
    const fieldOverrides = baseProp.fields as Record<string, { nullable?: boolean; hidden?: boolean; fillable?: boolean; length?: number }> | undefined;
    const fieldOverride = fieldOverrides?.[field.suffix];

    // Handle enumRef field - reference to enum schema (creates native ENUM column)
    const fieldWithEnumRef = field as { enumRef?: string };
    if (fieldWithEnumRef.enumRef) {
      // Try to resolve enum values from plugin enums
      const enumDef = options.pluginEnums?.get(fieldWithEnumRef.enumRef);
      if (enumDef && enumDef.values.length > 0) {
        // Use native ENUM type with resolved values
        expandedProp.type = 'Enum';
        expandedProp.enum = enumDef.values.map(v => v.value);
      } else {
        // Fallback to string storage if enum not found
        expandedProp.type = 'EnumRef';
        expandedProp.enum = fieldWithEnumRef.enumRef;
      }
      // Inherit nullable from parent property, or use per-field override
      if (fieldOverride?.nullable !== undefined) {
        expandedProp.nullable = fieldOverride.nullable;
      } else if (baseProp.nullable !== undefined) {
        expandedProp.nullable = baseProp.nullable;
      }
    }
    // Map SQL type to Omnify type
    else if (field.sql) {
      const sqlType = field.sql.sqlType.toUpperCase();
      if (sqlType === 'VARCHAR' || sqlType === 'CHAR' || sqlType === 'STRING') {
        expandedProp.type = 'String';
        // Use field override length if provided, otherwise use default from type definition
        if (fieldOverride?.length) {
          expandedProp.length = fieldOverride.length;
        } else if (field.sql.length) {
          expandedProp.length = field.sql.length;
        }
      } else if (sqlType === 'TINYINT') {
        expandedProp.type = 'TinyInt';
      } else if (sqlType === 'INT' || sqlType === 'INTEGER') {
        expandedProp.type = 'Int';
      } else if (sqlType === 'BIGINT') {
        expandedProp.type = 'BigInt';
      } else if (sqlType === 'TEXT') {
        expandedProp.type = 'Text';
      } else if (sqlType === 'BOOLEAN' || sqlType === 'BOOL') {
        expandedProp.type = 'Boolean';
      } else if (sqlType === 'DECIMAL') {
        expandedProp.type = 'Decimal';
        if (field.sql.precision) expandedProp.precision = field.sql.precision;
        if (field.sql.scale) expandedProp.scale = field.sql.scale;
      } else if (sqlType === 'DATE') {
        expandedProp.type = 'Date';
      } else if (sqlType === 'TIMESTAMP' || sqlType === 'DATETIME') {
        expandedProp.type = 'Timestamp';
      }

      // Handle unsigned flag for integer types
      if (field.sql.unsigned) {
        expandedProp.unsigned = true;
      }

      // Handle default value
      if (field.sql.default !== undefined) {
        expandedProp.default = field.sql.default;
      }

      // Handle nullable: priority is per-field override > field.sql.nullable > parent property
      if (field.sql.nullable !== undefined) {
        expandedProp.nullable = field.sql.nullable;
      } else if (baseProp.nullable !== undefined) {
        expandedProp.nullable = baseProp.nullable;
      }
      // Per-field nullable override takes highest priority
      if (fieldOverride?.nullable !== undefined) {
        expandedProp.nullable = fieldOverride.nullable;
      }
    }

    // Copy displayName if parent has it (with suffix context)
    // Resolve LocalizedString to string before appending suffix
    if (baseProp.displayName) {
      const resolvedDisplayName = resolveLocalizedString(
        baseProp.displayName as LocalizedString,
        options.locale
      );
      if (resolvedDisplayName) {
        expandedProp.displayName = `${resolvedDisplayName} (${field.suffix})`;
      }
    }

    expanded.push({
      name: columnName,
      property: expandedProp as unknown as PropertyDefinition,
    });
  }

  return expanded;
}

/**
 * Options for schema to blueprint conversion.
 */
export interface SchemaToBlueprintOptions {
  /** Custom types from plugins (for compound type expansion) */
  customTypes?: ReadonlyMap<string, CustomTypeDefinition>;
  /** Plugin enums from registry (for enumRef resolution) */
  pluginEnums?: ReadonlyMap<string, PluginEnumDefinition>;
  /** Locale resolution options for displayName */
  locale?: LocaleResolutionOptions;
}

/**
 * Generates table blueprint from schema.
 */
export function schemaToBlueprint(
  schema: LoadedSchema,
  allSchemas: SchemaCollection,
  options: SchemaToBlueprintOptions = {}
): TableBlueprint {
  const { customTypes = new Map(), pluginEnums = new Map(), locale } = options;
  const compoundOptions: CompoundTypeExpandOptions = { locale, pluginEnums };
  // Use options.tableName if specified, otherwise derive from schema name
  const tableName = schema.options?.tableName ?? toTableName(schema.name);
  const columns: ColumnMethod[] = [];
  const foreignKeys: ForeignKeyDefinition[] = [];
  const indexes: IndexDefinition[] = [];

  // 明示的に定義されたカラム名を収集（Association FKの重複を防ぐため）
  const explicitColumnNames = new Set<string>();
  if (schema.properties) {
    for (const [propName, property] of Object.entries(schema.properties)) {
      // Association以外のプロパティは明示的なカラムとして記録
      if (property.type !== 'Association') {
        explicitColumnNames.add(toColumnName(propName));
      }
    }
  }

  // Primary key (only if id is not disabled)
  if (hasAutoId(schema)) {
    const pkType = getIdType(schema);
    columns.push(generatePrimaryKeyColumn(pkType));
  }

  // Handle pivot schema: auto-generate FK columns from pivotFor
  const pivotFor = (schema as { pivotFor?: readonly [string, string] }).pivotFor;
  if (schema.kind === 'pivot' && pivotFor && pivotFor.length === 2) {
    for (const targetSchemaName of pivotFor) {
      const targetSchema = allSchemas[targetSchemaName];
      const fkColumnName = `${toColumnName(targetSchemaName)}_id`;

      // Skip if already explicitly defined in properties
      if (!explicitColumnNames.has(fkColumnName)) {
        // Determine ID type from target schema
        const targetIdType = targetSchema?.options?.idType ?? 'BigInt';
        const columnType = targetIdType === 'Uuid' ? 'uuid' :
          targetIdType === 'String' ? 'string' : 'unsignedBigInteger';

        columns.push({
          name: fkColumnName,
          method: columnType,
          args: [fkColumnName],  // Column name must be first arg
          modifiers: [],
        });
        explicitColumnNames.add(fkColumnName);
      }

      // Add foreign key constraint
      const targetTableName = targetSchema?.options?.tableName ?? toTableName(targetSchemaName);
      foreignKeys.push({
        columns: [fkColumnName],
        references: 'id',
        on: [targetTableName],
        onDelete: 'CASCADE',
      });

      // Add index for FK
      indexes.push({
        columns: [fkColumnName],
        unique: false,
      });
    }
  }

  // PropertyToColumnOptions for regular property handling
  const columnOptions: PropertyToColumnOptions = { locale };

  // Process properties
  if (schema.properties) {
    for (const [propName, property] of Object.entries(schema.properties)) {
      // Check for compound type expansion first (uses compoundOptions with pluginEnums)
      const expandedProps = expandCompoundType(propName, property, customTypes, compoundOptions);
      if (expandedProps) {
        // Compound type - process each expanded property
        for (const { name: expandedName, property: expandedProp } of expandedProps) {
          const columnMethod = propertyToColumnMethod(expandedName, expandedProp, columnOptions);
          if (columnMethod) {
            columns.push(columnMethod);
          }
        }
        continue; // Skip normal processing for compound types
      }

      // Handle regular columns
      const columnMethod = propertyToColumnMethod(propName, property, columnOptions);
      if (columnMethod) {
        columns.push(columnMethod);
      }

      // Handle foreign keys (standard associations)
      const fkResult = generateForeignKey(propName, property, allSchemas, columnOptions);
      if (fkResult) {
        // FKカラムが明示的に定義されている場合はカラム作成をスキップ
        // （FK制約とインデックスは追加する）
        if (!explicitColumnNames.has(fkResult.column.name)) {
          columns.push(fkResult.column);
        }
        foreignKeys.push(fkResult.foreignKey);
        indexes.push(fkResult.index);
      }

      // Handle polymorphic columns (MorphTo)
      const polyResult = generatePolymorphicColumns(propName, property, allSchemas);
      if (polyResult) {
        columns.push(polyResult.typeColumn);
        columns.push(polyResult.idColumn);
        indexes.push(...polyResult.indexes);
      }
    }
  }

  // Timestamps
  if (schema.options?.timestamps !== false) {
    columns.push(...generateTimestampColumns());
  }

  // Soft delete
  if (schema.options?.softDelete) {
    columns.push(generateSoftDeleteColumn());
  }

  // Custom indexes
  if (schema.options?.indexes) {
    // Helper to convert property name to column name, considering Association type
    const propToColName = (propName: string): string => {
      const colName = toColumnName(propName);
      const prop = schema.properties?.[propName];
      if (prop?.type === 'Association') {
        const assoc = prop as { relation?: string; mappedBy?: string };
        // Only add _id for owning side (ManyToOne, OneToOne without mappedBy)
        if (
          (assoc.relation === 'ManyToOne' || assoc.relation === 'OneToOne') &&
          !assoc.mappedBy
        ) {
          return colName + '_id';
        }
      }
      return colName;
    };

    for (const index of schema.options.indexes) {
      // Handle both shorthand (string) and full object format
      if (typeof index === 'string') {
        // Shorthand: just column name
        indexes.push({
          columns: [propToColName(index)],
          unique: false,
        });
      } else {
        // Full object format
        indexes.push({
          name: index.name,
          columns: index.columns.map(propToColName),
          unique: index.unique ?? false,
        });
      }
    }
  }

  // Unique constraints
  if (schema.options?.unique) {
    // Helper to convert property name to column name, considering Association type
    const propToColName = (propName: string): string => {
      const colName = toColumnName(propName);
      const prop = schema.properties?.[propName];
      if (prop?.type === 'Association') {
        const assoc = prop as { relation?: string; mappedBy?: string };
        if (
          (assoc.relation === 'ManyToOne' || assoc.relation === 'OneToOne') &&
          !assoc.mappedBy
        ) {
          return colName + '_id';
        }
      }
      return colName;
    };

    const uniqueConstraints = Array.isArray(schema.options.unique[0])
      ? (schema.options.unique as readonly (readonly string[])[])
      : [schema.options.unique as readonly string[]];

    for (const constraint of uniqueConstraints) {
      indexes.push({
        columns: constraint.map(propToColName),
        unique: true,
      });
    }
  }

  // Deduplicate indexes by columns (keep first occurrence)
  const seenIndexes = new Set<string>();
  const uniqueIndexes = indexes.filter(idx => {
    const key = idx.columns.join(',') + (idx.unique ? ':unique' : '');
    if (seenIndexes.has(key)) {
      return false;
    }
    seenIndexes.add(key);
    return true;
  });

  // Determine primary key column(s)
  let primaryKey: string[] | undefined;
  if (hasAutoId(schema)) {
    primaryKey = ['id'];
  } else if (schema.properties) {
    // Find properties marked with primary: true
    const pkColumns: string[] = [];
    for (const [propName, property] of Object.entries(schema.properties)) {
      if ((property as { primary?: boolean }).primary) {
        pkColumns.push(toColumnName(propName));
      }
    }
    if (pkColumns.length > 0) {
      primaryKey = pkColumns;
    }
  }

  // Pivot schema with id: false: use composite primary key from pivotFor
  // This ensures unique constraint on (source_id, target_id)
  const pivotForPk = (schema as { pivotFor?: readonly [string, string] }).pivotFor;
  if (schema.kind === 'pivot' && !hasAutoId(schema) && !primaryKey && pivotForPk && pivotForPk.length === 2) {
    primaryKey = pivotForPk.map(name => `${toColumnName(name)}_id`);
  }

  // 複合主キーの場合、個別カラムから primary モディファイアを削除
  // （$table->primary(['col1', 'col2']) を使用するため）
  let finalColumns = columns;
  if (primaryKey && primaryKey.length > 1) {
    const pkSet = new Set(primaryKey);
    finalColumns = columns.map(col => {
      if (pkSet.has(col.name)) {
        // primary モディファイアを除外
        const filteredModifiers = col.modifiers.filter(mod => mod.method !== 'primary');
        return { ...col, modifiers: filteredModifiers };
      }
      return col;
    });
  }

  return {
    tableName,
    columns: finalColumns,
    primaryKey,
    foreignKeys,
    indexes: uniqueIndexes,
  };
}

/**
 * Formats a column method to PHP code.
 */
export function formatColumnMethod(column: ColumnMethod): string {
  const args = column.args.map(arg => {
    if (typeof arg === 'string') {
      return `'${arg}'`;
    }
    if (Array.isArray(arg)) {
      return `[${(arg as string[]).map(v => `'${v}'`).join(', ')}]`;
    }
    return String(arg);
  }).join(', ');

  let code = `$table->${column.method}(${args})`;

  for (const modifier of column.modifiers) {
    if (modifier.args && modifier.args.length > 0) {
      const modArgs = modifier.args.map(arg => {
        if (typeof arg === 'string') {
          return `'${arg}'`;
        }
        if (typeof arg === 'boolean') {
          return arg ? 'true' : 'false';
        }
        if (typeof arg === 'number') {
          return String(arg);
        }
        return String(arg);
      }).join(', ');
      code += `->${modifier.method}(${modArgs})`;
    } else {
      code += `->${modifier.method}()`;
    }
  }

  return code + ';';
}

/**
 * Formats a foreign key to PHP code.
 */
export function formatForeignKey(fk: ForeignKeyDefinition): string {
  const column = fk.columns[0];
  const table = fk.on[0];
  let code = `$table->foreign('${column}')->references('${fk.references}')->on('${table}')`;

  if (fk.onDelete) {
    code += `->onDelete('${fk.onDelete}')`;
  }
  if (fk.onUpdate) {
    code += `->onUpdate('${fk.onUpdate}')`;
  }

  return code + ';';
}

/**
 * Formats an index to PHP code.
 */
export function formatIndex(index: IndexDefinition): string {
  const columns = index.columns.length === 1
    ? `'${index.columns[0]}'`
    : `[${index.columns.map(c => `'${c}'`).join(', ')}]`;

  const method = index.unique ? 'unique' : 'index';
  const name = index.name ? `, '${index.name}'` : '';

  return `$table->${method}(${columns}${name});`;
}

/**
 * Pivot field definition (simplified from PropertyDefinition for pivot tables).
 */
export interface PivotFieldInfo {
  /** Field name in snake_case */
  name: string;
  /** Property type (String, Int, Boolean, Timestamp, etc.) */
  type: string;
  /** Whether the field can be null */
  nullable?: boolean;
  /** Default value for the field */
  default?: unknown;
  /** String length (for String type) */
  length?: number;
  /** Whether the field is unsigned (for numeric types) */
  unsigned?: boolean;
}

/**
 * Pivot table information for ManyToMany relationships.
 */
export interface PivotTableInfo {
  tableName: string;
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
  sourcePkType: 'Int' | 'BigInt' | 'Uuid' | 'String';
  targetPkType: 'Int' | 'BigInt' | 'Uuid' | 'String';
  onDelete: string | undefined;
  onUpdate: string | undefined;
  /** Additional fields on the pivot table */
  pivotFields?: PivotFieldInfo[];
}

/**
 * Polymorphic pivot table information for MorphToMany relationships.
 */
export interface MorphToManyPivotInfo {
  tableName: string;
  /** The fixed target schema that uses MorphToMany */
  targetTable: string;
  targetColumn: string;
  targetPkType: 'Int' | 'BigInt' | 'Uuid' | 'String';
  /** Base name for polymorphic columns (creates {name}_type and {name}_id) */
  morphName: string;
  /** Schema names that can be morphed to */
  morphTargets: readonly string[];
  onDelete: string | undefined;
  onUpdate: string | undefined;
}

/**
 * Generates pivot table name for ManyToMany relationship.
 * Uses alphabetical ordering for consistency.
 */
export function generatePivotTableName(
  sourceTable: string,
  targetTable: string,
  customName?: string
): string {
  if (customName) {
    return customName;
  }

  // Sort alphabetically for consistent naming
  const tables = [sourceTable, targetTable].sort();
  // Singularize table names and join with underscore
  const singular1 = singularize(tables[0]!);
  const singular2 = singularize(tables[1]!);
  return `${singular1}_${singular2}`;
}

/**
 * Extracts ManyToMany relationships from a schema.
 */
export function extractManyToManyRelations(
  schema: LoadedSchema,
  allSchemas: SchemaCollection
): PivotTableInfo[] {
  const pivotTables: PivotTableInfo[] = [];

  if (!schema.properties) {
    return pivotTables;
  }

  const sourceTable = toTableName(schema.name);
  const sourcePkType = getIdType(schema);

  for (const [, property] of Object.entries(schema.properties)) {
    if (property.type !== 'Association') {
      continue;
    }

    const assocProp = property as {
      relation?: string;
      target?: string;
      joinTable?: string;
      onDelete?: string;
      onUpdate?: string;
      owning?: boolean;
      mappedBy?: string;
      pivotFields?: Record<string, {
        type: string;
        nullable?: boolean;
        default?: unknown;
        length?: number;
        unsigned?: boolean;
      }>;
    };

    // Only handle ManyToMany on the owning side (or if not specified, use alphabetical order)
    if (assocProp.relation !== 'ManyToMany') {
      continue;
    }

    // Skip inverse side (mappedBy means this is the inverse side)
    if (assocProp.mappedBy) {
      continue;
    }

    const targetName = assocProp.target;
    if (!targetName) {
      continue;
    }

    const targetSchema = allSchemas[targetName];
    const targetTable = toTableName(targetName);
    const targetPkType = targetSchema ? getIdType(targetSchema) : 'BigInt';

    // Determine if this side owns the relationship
    // Priority: 1) explicit owning flag, 2) pivotFields presence, 3) inverse side check, 4) alphabetical
    let isOwningSide: boolean;

    if (assocProp.owning !== undefined) {
      // Explicit owning flag takes highest priority
      isOwningSide = assocProp.owning;
    } else if (assocProp.pivotFields && Object.keys(assocProp.pivotFields).length > 0) {
      // If this side defines pivotFields, it's the owning side
      isOwningSide = true;
    } else {
      // Check if target schema has an inverse relationship with mappedBy pointing to this schema
      // If so, this side should be the owner
      let targetHasMappedByToThisSide = false;
      if (targetSchema?.properties) {
        for (const [, targetProp] of Object.entries(targetSchema.properties)) {
          if (targetProp.type !== 'Association') continue;
          const targetAssoc = targetProp as { relation?: string; target?: string; mappedBy?: string };
          if (
            targetAssoc.relation === 'ManyToMany' &&
            targetAssoc.target === schema.name &&
            targetAssoc.mappedBy
          ) {
            targetHasMappedByToThisSide = true;
            break;
          }
        }
      }

      if (targetHasMappedByToThisSide) {
        // Target has mappedBy pointing to this schema, so this is the owning side
        isOwningSide = true;
      } else {
        // Fall back to alphabetical ordering
        isOwningSide = schema.name < targetName;
      }
    }

    if (!isOwningSide) {
      continue; // Skip non-owning side to avoid duplicate pivot tables
    }

    const pivotTableName = generatePivotTableName(sourceTable, targetTable, assocProp.joinTable);

    // Column names: singular form of table name + _id
    const sourceColumn = singularize(sourceTable) + '_id';
    const targetColumn = singularize(targetTable) + '_id';

    // Extract pivot fields
    const pivotFields: PivotFieldInfo[] = [];
    if (assocProp.pivotFields) {
      for (const [fieldName, fieldDef] of Object.entries(assocProp.pivotFields)) {
        pivotFields.push({
          name: toColumnName(fieldName),
          type: fieldDef.type,
          nullable: fieldDef.nullable,
          default: fieldDef.default,
          length: fieldDef.length,
          unsigned: fieldDef.unsigned,
        });
      }
    }

    pivotTables.push({
      tableName: pivotTableName,
      sourceTable,
      targetTable,
      sourceColumn,
      targetColumn,
      sourcePkType,
      targetPkType,
      onDelete: assocProp.onDelete,
      onUpdate: assocProp.onUpdate,
      pivotFields: pivotFields.length > 0 ? pivotFields : undefined,
    });
  }

  return pivotTables;
}

/**
 * Converts a pivot field definition to a column method.
 */
function pivotFieldToColumn(field: PivotFieldInfo): ColumnMethod {
  const method = TYPE_METHOD_MAP[field.type] ?? 'string';
  const args: (string | number | boolean)[] = [field.name];
  const modifiers: ColumnModifier[] = [];

  // Handle length for string types
  if (method === 'string' && field.length) {
    args.push(field.length);
  }

  // Handle nullable
  if (field.nullable) {
    modifiers.push({ method: 'nullable' });
  }

  // Handle default value
  if (field.default !== undefined && field.default !== null) {
    modifiers.push({ method: 'default', args: [field.default as string | number | boolean] });
  }

  // Handle unsigned for numeric types
  if (field.unsigned && (method === 'tinyInteger' || method === 'integer' || method === 'bigInteger')) {
    modifiers.push({ method: 'unsigned' });
  }

  return {
    name: field.name,
    method,
    args,
    modifiers,
  };
}

/**
 * Generates blueprint for a pivot table.
 */
export function generatePivotTableBlueprint(pivot: PivotTableInfo): TableBlueprint {
  const columns: ColumnMethod[] = [];
  const foreignKeys: ForeignKeyDefinition[] = [];
  const indexes: IndexDefinition[] = [];

  // Determine column methods based on PK types
  const getMethodForPkType = (pkType: string): string => {
    switch (pkType) {
      case 'Int': return 'unsignedInteger';
      case 'Uuid': return 'uuid';
      case 'String': return 'string';
      default: return 'unsignedBigInteger';
    }
  };

  // Source column
  columns.push({
    name: pivot.sourceColumn,
    method: getMethodForPkType(pivot.sourcePkType),
    args: [pivot.sourceColumn],
    modifiers: [],
  });

  // Target column
  columns.push({
    name: pivot.targetColumn,
    method: getMethodForPkType(pivot.targetPkType),
    args: [pivot.targetColumn],
    modifiers: [],
  });

  // Pivot fields (additional columns on the pivot table)
  if (pivot.pivotFields && pivot.pivotFields.length > 0) {
    for (const field of pivot.pivotFields) {
      columns.push(pivotFieldToColumn(field));
    }
  }

  // Timestamps for pivot table (Laravel's withTimestamps())
  columns.push(...generateTimestampColumns());

  // Foreign keys
  foreignKeys.push({
    columns: [pivot.sourceColumn],
    references: 'id',
    on: [pivot.sourceTable],
    onDelete: pivot.onDelete ?? 'cascade',
    onUpdate: pivot.onUpdate ?? 'cascade',
  });

  foreignKeys.push({
    columns: [pivot.targetColumn],
    references: 'id',
    on: [pivot.targetTable],
    onDelete: pivot.onDelete ?? 'cascade',
    onUpdate: pivot.onUpdate ?? 'cascade',
  });

  // Composite primary key / unique constraint
  indexes.push({
    columns: [pivot.sourceColumn, pivot.targetColumn],
    unique: true,
  });

  // Individual indexes for faster lookups (no name - let Laravel auto-generate)
  indexes.push({
    columns: [pivot.sourceColumn],
    unique: false,
  });

  indexes.push({
    columns: [pivot.targetColumn],
    unique: false,
  });

  return {
    tableName: pivot.tableName,
    columns,
    primaryKey: [pivot.sourceColumn, pivot.targetColumn],
    foreignKeys,
    indexes,
  };
}

/**
 * Extracts MorphToMany relationships from a schema.
 * MorphToMany creates a pivot table with polymorphic type/id columns.
 */
export function extractMorphToManyRelations(
  schema: LoadedSchema,
  allSchemas: SchemaCollection
): MorphToManyPivotInfo[] {
  const morphPivotTables: MorphToManyPivotInfo[] = [];

  if (!schema.properties) {
    return morphPivotTables;
  }

  for (const [propName, property] of Object.entries(schema.properties)) {
    if (property.type !== 'Association') {
      continue;
    }

    const assocProp = property as {
      relation?: string;
      target?: string;
      joinTable?: string;
      onDelete?: string;
      onUpdate?: string;
      owning?: boolean;
    };

    if (assocProp.relation !== 'MorphToMany') {
      continue;
    }

    const targetName = assocProp.target;
    if (!targetName) {
      continue;
    }

    const targetSchema = allSchemas[targetName];
    const targetTable = toTableName(targetName);
    const targetPkType = targetSchema ? getIdType(targetSchema) : 'BigInt';

    // Determine if this side owns the relationship
    const isOwningSide = assocProp.owning ?? (schema.name < targetName);

    if (!isOwningSide) {
      continue;
    }

    // Find all schemas that have MorphedByMany pointing to this target
    // to determine the morphTargets for the ENUM
    const morphTargets: string[] = [];

    // The source schema itself is a morph target
    morphTargets.push(schema.name);

    // Look for other schemas with MorphToMany to the same target
    for (const [otherName, otherSchema] of Object.entries(allSchemas)) {
      if (otherName === schema.name) continue;
      if (!otherSchema.properties) continue;

      for (const otherProp of Object.values(otherSchema.properties)) {
        if (otherProp.type !== 'Association') continue;
        const otherAssoc = otherProp as { relation?: string; target?: string };
        if (otherAssoc.relation === 'MorphToMany' && otherAssoc.target === targetName) {
          if (!morphTargets.includes(otherName)) {
            morphTargets.push(otherName);
          }
        }
      }
    }

    // Default table name: taggables (for Tag target), commentables, etc.
    const defaultTableName = targetTable.replace(/s$/, '') + 'ables';
    const tableName = assocProp.joinTable ?? defaultTableName;

    // Column name for the target side (e.g., tag_id for Tag)
    const targetColumn = singularize(targetTable) + '_id';

    // MorphName is typically the property name or a convention like 'taggable'
    const morphName = propName.replace(/s$/, '') + 'able';

    morphPivotTables.push({
      tableName,
      targetTable,
      targetColumn,
      targetPkType,
      morphName,
      morphTargets,
      onDelete: assocProp.onDelete,
      onUpdate: assocProp.onUpdate,
    });
  }

  return morphPivotTables;
}

/**
 * Generates blueprint for a polymorphic pivot table (MorphToMany).
 */
export function generateMorphToManyPivotBlueprint(pivot: MorphToManyPivotInfo): TableBlueprint {
  const columns: ColumnMethod[] = [];
  const foreignKeys: ForeignKeyDefinition[] = [];
  const indexes: IndexDefinition[] = [];

  const getMethodForPkType = (pkType: string): string => {
    switch (pkType) {
      case 'Int': return 'unsignedInteger';
      case 'Uuid': return 'uuid';
      case 'String': return 'string';
      default: return 'unsignedBigInteger';
    }
  };

  // Target column (e.g., tag_id)
  columns.push({
    name: pivot.targetColumn,
    method: getMethodForPkType(pivot.targetPkType),
    args: [pivot.targetColumn],
    modifiers: [],
  });

  // Polymorphic type column as ENUM
  const typeColumnName = `${pivot.morphName}_type`;
  columns.push({
    name: typeColumnName,
    method: 'enum',
    args: [typeColumnName, pivot.morphTargets as unknown as string],
    modifiers: [],
  });

  // Polymorphic ID column
  const idColumnName = `${pivot.morphName}_id`;
  columns.push({
    name: idColumnName,
    method: 'unsignedBigInteger', // Default to BigInt for polymorphic IDs
    args: [idColumnName],
    modifiers: [],
  });

  // Foreign key for target
  foreignKeys.push({
    columns: [pivot.targetColumn],
    references: 'id',
    on: [pivot.targetTable],
    onDelete: pivot.onDelete ?? 'cascade',
    onUpdate: pivot.onUpdate ?? 'cascade',
  });

  // Unique constraint for polymorphic pivot (target + morphable)
  indexes.push({
    columns: [pivot.targetColumn, typeColumnName, idColumnName],
    unique: true,
  });

  // Index for faster polymorphic lookups
  indexes.push({
    columns: [typeColumnName, idColumnName],
    unique: false,
  });

  // Index for target lookups
  indexes.push({
    columns: [pivot.targetColumn],
    unique: false,
  });

  return {
    tableName: pivot.tableName,
    columns,
    primaryKey: [pivot.targetColumn, typeColumnName, idColumnName],
    foreignKeys,
    indexes,
  };
}

// Note: File schema functions (hasFileProperties, schemasHaveFileProperties, generateFilesTableBlueprint)
// have been moved to @famgia/omnify-core's schema/loader.ts
// The File table is now managed as a proper schema (File.yaml) instead of being auto-generated in code.
