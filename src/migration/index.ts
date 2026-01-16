/**
 * @famgia/omnify-laravel - Migration Module
 *
 * Laravel migration generation exports.
 */

export type {
  MigrationFile,
  MigrationOptions,
  ColumnMethod,
  ColumnModifier,
  ForeignKeyDefinition,
  IndexDefinition,
  TableBlueprint,
  MigrationOperation,
  MigrationDefinition,
} from './types.js';

export type {
  PivotFieldInfo,
  PivotTableInfo,
  MorphToManyPivotInfo,
} from './schema-builder.js';

export {
  toColumnName,
  toTableName,
  propertyToColumnMethod,
  generatePrimaryKeyColumn,
  generateTimestampColumns,
  generateSoftDeleteColumn,
  generateForeignKey,
  schemaToBlueprint,
  formatColumnMethod,
  formatForeignKey,
  formatIndex,
  generatePivotTableName,
  extractManyToManyRelations,
  generatePivotTableBlueprint,
  extractMorphToManyRelations,
  generateMorphToManyPivotBlueprint,
} from './schema-builder.js';

export {
  generateMigrations,
  generateMigrationFromSchema,
  generateDropMigrationForTable,
  formatMigrationFile,
  getMigrationPath,
} from './generator.js';

export {
  generateAlterMigration,
  generateDropTableMigration,
  generateMigrationsFromChanges,
} from './alter-generator.js';
