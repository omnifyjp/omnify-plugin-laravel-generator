/**
 * @famgia/omnify-laravel
 *
 * Laravel migration generator for Omnify schemas.
 */

// Migration generation
export {
  // Types
  type MigrationFile,
  type MigrationOptions,
  type ColumnMethod,
  type ColumnModifier,
  type ForeignKeyDefinition,
  type IndexDefinition,
  type TableBlueprint,
  type MigrationOperation,
  type MigrationDefinition,
  type PivotFieldInfo,
  type PivotTableInfo,
  type MorphToManyPivotInfo,
  // Schema builder
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
  // Generator
  generateMigrations,
  generateMigrationFromSchema,
  generateDropMigrationForTable,
  formatMigrationFile,
  getMigrationPath,
  // ALTER migration generator
  generateAlterMigration,
  generateDropTableMigration,
  generateMigrationsFromChanges,
} from './migration/index.js';

// Model generation
export {
  generateModels,
  getModelPath,
  generateProviderRegistration,
  type GeneratedModel,
  type ModelGeneratorOptions,
  type ProviderRegistrationResult,
} from './model/index.js';

// Factory generation
export {
  generateFactories,
  getFactoryPath,
  type FactoryGeneratorOptions,
  type GeneratedFactory,
} from './factory/index.js';

// Plugin
export {
  default as laravelPlugin,
  type LaravelPluginOptions,
} from './plugin.js';

// AI Guides generation
export {
  generateAIGuides,
  shouldGenerateAIGuides,
  type AIGuidesOptions,
  type AIGuidesResult,
} from './ai-guides/index.js';
