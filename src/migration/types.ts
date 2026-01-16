/**
 * @famgia/omnify-laravel - Migration Types
 *
 * Types for Laravel migration generation.
 */

import type { CustomTypeDefinition, LocaleResolutionOptions, PluginEnumDefinition } from '@famgia/omnify-types';

/**
 * Laravel migration file structure.
 */
export interface MigrationFile {
  /** File name with timestamp prefix */
  readonly fileName: string;
  /** Migration class name */
  readonly className: string;
  /** Full file content */
  readonly content: string;
  /** Tables affected */
  readonly tables: readonly string[];
  /** Whether this is a create or alter migration */
  readonly type: 'create' | 'alter' | 'drop';
  /** 
   * Schema name (for routing to correct output path when packageOutput is set).
   * Undefined for pivot tables or system migrations.
   */
  readonly schemaName?: string | undefined;
}

/**
 * Migration generation options.
 */
export interface MigrationOptions {
  /** Output directory for migrations */
  readonly outputDir?: string | undefined;
  /** Timestamp prefix (defaults to current time) */
  readonly timestamp?: string | undefined;
  /** Whether to generate down migration */
  readonly generateDown?: boolean | undefined;
  /** Database connection name */
  readonly connection?: string | undefined;
  /** Custom types from plugins (for compound type expansion) */
  readonly customTypes?: ReadonlyMap<string, CustomTypeDefinition> | undefined;
  /** Plugin enums from registry (for enumRef resolution) */
  readonly pluginEnums?: ReadonlyMap<string, PluginEnumDefinition> | undefined;
  /** Locale resolution options for displayName */
  readonly locale?: LocaleResolutionOptions | undefined;
}

/**
 * Schema Builder column method.
 */
export interface ColumnMethod {
  /** Column name */
  readonly name: string;
  /** Method name (e.g., 'string', 'integer', 'boolean') */
  readonly method: string;
  /** Method arguments */
  readonly args: readonly (string | number | boolean)[];
  /** Chained modifiers (e.g., nullable(), unique(), default()) */
  readonly modifiers: readonly ColumnModifier[];
}

/**
 * Column modifier (chained method).
 */
export interface ColumnModifier {
  /** Modifier method name */
  readonly method: string;
  /** Modifier arguments */
  readonly args?: readonly (string | number | boolean)[] | undefined;
}

/**
 * Foreign key definition for Schema Builder.
 */
export interface ForeignKeyDefinition {
  /** Local column(s) */
  readonly columns: readonly string[];
  /** Referenced table */
  readonly references: string;
  /** Referenced column(s) */
  readonly on: readonly string[];
  /** ON DELETE action */
  readonly onDelete?: string | undefined;
  /** ON UPDATE action */
  readonly onUpdate?: string | undefined;
}

/**
 * Index definition for Schema Builder.
 */
export interface IndexDefinition {
  /** Index name */
  readonly name?: string | undefined;
  /** Columns in the index */
  readonly columns: readonly string[];
  /** Whether this is a unique index */
  readonly unique: boolean;
}

/**
 * Table blueprint for Schema Builder.
 */
export interface TableBlueprint {
  /** Table name */
  readonly tableName: string;
  /** Column definitions */
  readonly columns: readonly ColumnMethod[];
  /** Primary key column(s) */
  readonly primaryKey?: readonly string[] | undefined;
  /** Foreign key constraints */
  readonly foreignKeys: readonly ForeignKeyDefinition[];
  /** Index definitions */
  readonly indexes: readonly IndexDefinition[];
}

/**
 * Migration operation (up or down).
 */
export interface MigrationOperation {
  /** Operation type */
  readonly type: 'create' | 'table' | 'drop' | 'dropIfExists';
  /** Table name */
  readonly tableName: string;
  /** Blueprint (for create/table operations) */
  readonly blueprint?: TableBlueprint | undefined;
}

/**
 * Complete migration definition.
 */
export interface MigrationDefinition {
  /** Migration class name */
  readonly className: string;
  /** UP operations */
  readonly up: readonly MigrationOperation[];
  /** DOWN operations */
  readonly down: readonly MigrationOperation[];
  /** Database connection */
  readonly connection?: string | undefined;
}
