/**
 * @famgia/omnify-laravel - Plugin
 *
 * Plugin for generating Laravel migration files and Eloquent models from Omnify schemas.
 *
 * @example Basic usage (Laravel at project root)
 * ```typescript
 * import { defineConfig } from '@famgia/omnify';
 * import laravel from '@famgia/omnify-laravel/plugin';
 *
 * export default defineConfig({
 *   plugins: [laravel()],  // Uses all defaults
 * });
 * ```
 *
 * @example Monorepo (Laravel in ./backend/)
 * ```typescript
 * import { defineConfig } from '@famgia/omnify';
 * import laravel from '@famgia/omnify-laravel/plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     laravel({
 *       base: './backend/',  // All paths relative to this
 *       generateRequests: true,
 *       generateResources: true,
 *     }),
 *   ],
 * });
 * ```
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OmnifyPlugin, GeneratorOutput, GeneratorContext, PluginConfigSchema, SchemaChange, LoadedSchema, SchemaCollection } from '@famgia/omnify-types';
import { generateMigrations, getMigrationPath, generateMigrationsFromChanges, type MigrationOptions, type MigrationFile } from './migration/index.js';
import { generateModels, getModelPath, generateProviderRegistration, type ModelGeneratorOptions } from './model/index.js';
import { generateFactories, getFactoryPath, type FactoryGeneratorOptions } from './factory/index.js';
import { generateRequests, getRequestPath, type RequestGeneratorOptions } from './request/index.js';
import { generateResources, getResourcePath, type ResourceGeneratorOptions } from './resource/index.js';
import { generateAIGuides, type PackagePath } from './ai-guides/index.js';

/**
 * Extract unique package paths from schemas with packageOutput.laravel config
 */
function extractPackagePaths(schemas: SchemaCollection): PackagePath[] {
  const packageMap = new Map<string, PackagePath>();

  for (const schema of Object.values(schemas)) {
    const pkg = schema.packageOutput?.laravel;
    if (pkg?.base && !packageMap.has(pkg.base)) {
      packageMap.set(pkg.base, {
        base: pkg.base,
        modelsPath: pkg.modelsPath ?? 'src/Models',
        migrationsPath: pkg.migrationsPath ?? 'database/migrations',
      });
    }
  }

  return Array.from(packageMap.values());
}

/**
 * スキーマのpackageOutputに基づいてmigration出力パスを取得
 */
function getMigrationPathForSchema(
  migration: MigrationFile,
  schemas: SchemaCollection,
  defaultPath: string
): string {
  // schemaNameが設定されている場合、そのスキーマのpackageOutputを確認
  if (migration.schemaName) {
    const schema = schemas[migration.schemaName];
    if (schema?.packageOutput?.laravel) {
      const pkg = schema.packageOutput.laravel;
      const migrationsPath = `${pkg.base}/${pkg.migrationsPath ?? 'database/migrations'}`;
      return `${migrationsPath}/${migration.fileName}`;
    }
  }
  return getMigrationPath(migration, defaultPath);
}

/**
 * Infer Laravel root directory from providersPath.
 * E.g., "./backend/app/Providers" → "./backend"
 * E.g., "app/Providers" → ""
 */
function inferLaravelRoot(providersPath: string): string {
  // Remove app/Providers suffix to get Laravel root
  const normalized = providersPath.replace(/\\/g, '/');
  const match = normalized.match(/^(.*)\/app\/Providers\/?$/i);
  if (match && match[1]) {
    return match[1];
  }
  // Check for OmnifyBase pattern: ./backend/app/Providers/OmnifyBase
  const baseMatch = normalized.match(/^(.*)\/app\/Providers\/OmnifyBase\/?$/i);
  if (baseMatch && baseMatch[1]) {
    return baseMatch[1];
  }
  return '';
}

/**
 * Scans a directory for existing migration files and returns tables that already have CREATE migrations.
 */
function getExistingMigrationTables(migrationsDir: string): Set<string> {
  const existingTables = new Set<string>();

  if (!existsSync(migrationsDir)) {
    return existingTables;
  }

  try {
    const files = readdirSync(migrationsDir);
    // Match pattern: YYYY_MM_DD_HHMMSS_create_<table>_table.php
    const createMigrationPattern = /^\d{4}_\d{2}_\d{2}_\d{6}_create_(.+)_table\.php$/;

    for (const file of files) {
      const match = file.match(createMigrationPattern);
      if (match) {
        existingTables.add(match[1]); // table name
      }
    }
  } catch {
    // Ignore errors reading directory
  }

  return existingTables;
}

/**
 * Gets the migrations directory for a schema, considering packageOutput.
 */
function getMigrationsDirForSchema(
  schema: LoadedSchema | undefined,
  cwd: string,
  defaultMigrationsPath: string
): string {
  if (schema?.packageOutput?.laravel) {
    const pkg = schema.packageOutput.laravel;
    const migrationsPath = pkg.migrationsPath ?? 'database/migrations';
    return join(cwd, pkg.base, migrationsPath);
  }
  return join(cwd, defaultMigrationsPath);
}

/**
 * Builds a map of existing tables per migrations directory.
 * This handles both main app and package-specific migration directories.
 */
function buildExistingTablesMap(
  schemas: SchemaCollection,
  cwd: string,
  defaultMigrationsPath: string
): Map<string, Set<string>> {
  const tablesMap = new Map<string, Set<string>>();
  const checkedDirs = new Set<string>();

  // Check default migrations directory
  const defaultDir = join(cwd, defaultMigrationsPath);
  tablesMap.set(defaultDir, getExistingMigrationTables(defaultDir));
  checkedDirs.add(defaultDir);

  // Check package-specific migrations directories
  for (const schema of Object.values(schemas)) {
    if (schema.packageOutput?.laravel) {
      const pkg = schema.packageOutput.laravel;
      const migrationsPath = pkg.migrationsPath ?? 'database/migrations';
      const pkgDir = join(cwd, pkg.base, migrationsPath);

      if (!checkedDirs.has(pkgDir)) {
        tablesMap.set(pkgDir, getExistingMigrationTables(pkgDir));
        checkedDirs.add(pkgDir);
      }
    }
  }

  return tablesMap;
}

/**
 * Checks if a table already has a migration in its target directory.
 */
function tableHasMigration(
  tableName: string,
  schemaName: string | undefined,
  schemas: SchemaCollection,
  existingTablesMap: Map<string, Set<string>>,
  cwd: string,
  defaultMigrationsPath: string
): boolean {
  const schema = schemaName ? schemas[schemaName] : undefined;
  const migrationsDir = getMigrationsDirForSchema(schema, cwd, defaultMigrationsPath);
  const existingTables = existingTablesMap.get(migrationsDir);
  return existingTables?.has(tableName) ?? false;
}

/**
 * Configuration schema for Laravel plugin UI settings
 */
const LARAVEL_CONFIG_SCHEMA: PluginConfigSchema = {
  fields: [
    {
      key: 'base',
      type: 'path',
      label: 'Laravel Base Path',
      description: 'Base directory for Laravel project (e.g., "./backend/" for monorepo). All other paths are relative to this.',
      default: '',
      group: 'output',
    },
    {
      key: 'migrationsPath',
      type: 'path',
      label: 'Migrations Path',
      description: 'Directory for Laravel migration files (relative to base)',
      default: 'database/migrations/omnify',
      group: 'output',
    },
    {
      key: 'modelsPath',
      type: 'path',
      label: 'Models Path',
      description: 'Directory for user-editable model files (relative to base)',
      default: 'app/Models',
      group: 'output',
    },
    {
      key: 'baseModelsPath',
      type: 'path',
      label: 'Base Models Path',
      description: 'Directory for auto-generated base model files',
      default: 'app/Models/OmnifyBase',
      group: 'output',
    },
    {
      key: 'providersPath',
      type: 'path',
      label: 'Providers Path',
      description: 'Directory for Laravel service provider files',
      default: 'app/Providers',
      group: 'output',
    },
    {
      key: 'generateModels',
      type: 'boolean',
      label: 'Generate Models',
      description: 'Generate Eloquent model classes',
      default: true,
      group: 'options',
    },
    {
      key: 'factoriesPath',
      type: 'path',
      label: 'Factories Path',
      description: 'Directory for Laravel factory files',
      default: 'database/factories',
      group: 'output',
    },
    {
      key: 'generateFactories',
      type: 'boolean',
      label: 'Generate Factories',
      description: 'Generate Laravel factory classes for testing',
      default: true,
      group: 'options',
    },
    {
      key: 'connection',
      type: 'string',
      label: 'Database Connection',
      description: 'Laravel database connection name (optional)',
      placeholder: 'mysql',
      group: 'options',
    },
    {
      key: 'requestsPath',
      type: 'path',
      label: 'Requests Path',
      description: 'Directory for user-editable FormRequest files',
      default: 'app/Http/Requests',
      group: 'output',
    },
    {
      key: 'baseRequestsPath',
      type: 'path',
      label: 'Base Requests Path',
      description: 'Directory for auto-generated base FormRequest files',
      default: 'app/Http/Requests/OmnifyBase',
      group: 'output',
    },
    {
      key: 'generateRequests',
      type: 'boolean',
      label: 'Generate Requests',
      description: 'Generate Laravel FormRequest classes for validation',
      default: false,
      group: 'options',
    },
    {
      key: 'resourcesPath',
      type: 'path',
      label: 'Resources Path',
      description: 'Directory for user-editable API Resource files',
      default: 'app/Http/Resources',
      group: 'output',
    },
    {
      key: 'baseResourcesPath',
      type: 'path',
      label: 'Base Resources Path',
      description: 'Directory for auto-generated base API Resource files',
      default: 'app/Http/Resources/OmnifyBase',
      group: 'output',
    },
    {
      key: 'generateResources',
      type: 'boolean',
      label: 'Generate Resources',
      description: 'Generate Laravel API Resource classes',
      default: false,
      group: 'options',
    },
  ],
};

/**
 * Options for the Laravel plugin.
 */
export interface LaravelPluginOptions {
  /**
   * Base directory for Laravel project (relative to project root).
   * All other paths will be relative to this base.
   * 
   * @default '' (project root)
   * @example './backend/' for monorepo with Laravel in backend folder
   */
  base?: string;

  /**
   * Path for Laravel migration files (relative to base).
   * @default 'database/migrations/omnify'
   */
  migrationsPath?: string;

  /**
   * Path for user-editable model files (relative to base).
   * @default 'app/Models'
   */
  modelsPath?: string;

  /**
   * Path for auto-generated base model files (relative to base).
   * @default 'app/Models/OmnifyBase'
   */
  baseModelsPath?: string;

  /**
   * Path for Laravel service provider files (relative to base).
   * @default 'app/Providers'
   */
  providersPath?: string;

  /**
   * Model namespace.
   * @default 'App\\Models'
   */
  modelNamespace?: string;

  /**
   * Base model namespace.
   * @default 'App\\Models\\OmnifyBase'
   */
  baseModelNamespace?: string;

  /**
   * Whether to generate Eloquent models.
   * @default true
   */
  generateModels?: boolean;

  /**
   * Path for Laravel factory files.
   * @default 'database/factories'
   */
  factoriesPath?: string;

  /**
   * Whether to generate Laravel factories.
   * @default true
   */
  generateFactories?: boolean;

  /**
   * Faker locale for factory data.
   * @default 'en_US'
   */
  fakerLocale?: string;

  /**
   * Database connection name for migrations.
   */
  connection?: string;

  /**
   * Custom timestamp for migration file names (mainly for testing).
   */
  timestamp?: string;

  /**
   * Path for user-editable FormRequest files.
   * @default 'app/Http/Requests'
   */
  requestsPath?: string;

  /**
   * Path for auto-generated base FormRequest files.
   * @default 'app/Http/Requests/OmnifyBase'
   */
  baseRequestsPath?: string;

  /**
   * Request namespace.
   * @default 'App\\Http\\Requests'
   */
  requestNamespace?: string;

  /**
   * Base request namespace.
   * @default 'App\\Http\\Requests\\OmnifyBase'
   */
  baseRequestNamespace?: string;

  /**
   * Whether to generate Laravel FormRequest classes.
   * @default true
   */
  generateRequests?: boolean;

  /**
   * Path for user-editable API Resource files.
   * @default 'app/Http/Resources'
   */
  resourcesPath?: string;

  /**
   * Path for auto-generated base API Resource files.
   * @default 'app/Http/Resources/OmnifyBase'
   */
  baseResourcesPath?: string;

  /**
   * Resource namespace.
   * @default 'App\\Http\\Resources'
   */
  resourceNamespace?: string;

  /**
   * Base resource namespace.
   * @default 'App\\Http\\Resources\\OmnifyBase'
   */
  baseResourceNamespace?: string;

  /**
   * Whether to generate Laravel API Resource classes.
   * @default true
   */
  generateResources?: boolean;
}

/**
 * Resolved options with defaults applied.
 */
interface ResolvedOptions {
  migrationsPath: string;
  modelsPath: string;
  baseModelsPath: string;
  providersPath: string;
  modelNamespace: string;
  baseModelNamespace: string;
  generateModels: boolean;
  factoriesPath: string;
  generateFactories: boolean;
  fakerLocale: string;
  connection: string | undefined;
  timestamp: string | undefined;
  requestsPath: string;
  baseRequestsPath: string;
  requestNamespace: string;
  baseRequestNamespace: string;
  generateRequests: boolean;
  resourcesPath: string;
  baseResourcesPath: string;
  resourceNamespace: string;
  baseResourceNamespace: string;
  generateResources: boolean;
}

/**
 * Resolves options with defaults.
 */
/**
 * Joins base path with relative path, normalizing slashes.
 */
function joinPath(base: string, relativePath: string): string {
  if (!base) return relativePath;
  // Normalize: remove trailing slash from base, ensure no double slashes
  const normalizedBase = base.replace(/\/+$/, '');
  return `${normalizedBase}/${relativePath}`;
}

function resolveOptions(options?: LaravelPluginOptions): ResolvedOptions {
  const base = options?.base ?? '';

  return {
    migrationsPath: options?.migrationsPath ?? joinPath(base, 'database/migrations/omnify'),
    modelsPath: options?.modelsPath ?? joinPath(base, 'app/Models'),
    baseModelsPath: options?.baseModelsPath ?? joinPath(base, 'app/Models/OmnifyBase'),
    providersPath: options?.providersPath ?? joinPath(base, 'app/Providers'),
    modelNamespace: options?.modelNamespace ?? 'App\\Models',
    baseModelNamespace: options?.baseModelNamespace ?? 'App\\Models\\OmnifyBase',
    generateModels: options?.generateModels ?? true,
    factoriesPath: options?.factoriesPath ?? joinPath(base, 'database/factories'),
    generateFactories: options?.generateFactories ?? true,
    fakerLocale: options?.fakerLocale ?? 'en_US',
    connection: options?.connection,
    timestamp: options?.timestamp,
    requestsPath: options?.requestsPath ?? joinPath(base, 'app/Http/Requests'),
    baseRequestsPath: options?.baseRequestsPath ?? joinPath(base, 'app/Http/Requests/OmnifyBase'),
    requestNamespace: options?.requestNamespace ?? 'App\\Http\\Requests',
    baseRequestNamespace: options?.baseRequestNamespace ?? 'App\\Http\\Requests\\OmnifyBase',
    generateRequests: options?.generateRequests ?? true,
    resourcesPath: options?.resourcesPath ?? joinPath(base, 'app/Http/Resources'),
    baseResourcesPath: options?.baseResourcesPath ?? joinPath(base, 'app/Http/Resources/OmnifyBase'),
    resourceNamespace: options?.resourceNamespace ?? 'App\\Http\\Resources',
    baseResourceNamespace: options?.baseResourceNamespace ?? 'App\\Http\\Resources\\OmnifyBase',
    generateResources: options?.generateResources ?? true,
  };
}

/**
 * Creates the Laravel plugin with the specified options.
 *
 * @param options - Plugin configuration options
 * @returns OmnifyPlugin configured for Laravel migrations and models
 */
export default function laravelPlugin(options?: LaravelPluginOptions): OmnifyPlugin {
  const resolved = resolveOptions(options);

  // Build generators array
  const migrationGenerator = {
    name: 'laravel-migrations',
    description: 'Generate Laravel migration files',

    generate: async (ctx: GeneratorContext): Promise<GeneratorOutput[]> => {
      const migrationOptions: MigrationOptions = {
        connection: resolved.connection,
        timestamp: resolved.timestamp,
        customTypes: ctx.customTypes,
        pluginEnums: ctx.pluginEnums,
      };

      const outputs: GeneratorOutput[] = [];

      // Build map of existing tables for all migration directories (main app + packages)
      const existingTablesMap = buildExistingTablesMap(
        ctx.schemas,
        ctx.cwd,
        resolved.migrationsPath
      );

      // Helper to check if table migration exists in the correct directory
      const hasMigration = (tableName: string, schemaName?: string) =>
        tableHasMigration(
          tableName,
          schemaName,
          ctx.schemas,
          existingTablesMap,
          ctx.cwd,
          resolved.migrationsPath
        );

      // If we have change information (including empty array), use it for smarter migration generation
      // undefined = no change info → fallback to generating all
      // empty array = no changes detected → no migrations needed
      if (ctx.changes !== undefined) {
        // Empty changes array = no changes, no migrations needed
        if (ctx.changes.length === 0) {
          return outputs;
        }

        // Generate CREATE migrations only for added schemas
        const addedSchemaNames = new Set(
          ctx.changes
            .filter((c) => c.changeType === 'added')
            .map((c) => c.schemaName)
        );

        if (addedSchemaNames.size > 0) {
          const addedSchemas = Object.fromEntries(
            Object.entries(ctx.schemas).filter(([name]) => addedSchemaNames.has(name))
          );

          const createMigrations = generateMigrations(addedSchemas, migrationOptions);

          for (const migration of createMigrations) {
            const tableName = migration.tables[0];
            // Skip if table already has a create migration (check correct directory based on packageOutput)
            if (hasMigration(tableName, migration.schemaName)) {
              ctx.logger.debug(`Skipping CREATE for ${tableName} (already exists)`);
              continue;
            }

            outputs.push({
              path: getMigrationPathForSchema(migration, ctx.schemas, resolved.migrationsPath),
              content: migration.content,
              type: 'migration' as const,
              metadata: {
                tableName,
                migrationType: 'create',
              },
            });
          }
        }

        // Generate ALTER/DROP migrations for modified/removed schemas
        const alterChanges = ctx.changes.filter(
          (c) => c.changeType === 'modified' || c.changeType === 'removed'
        );

        if (alterChanges.length > 0) {
          // Convert SchemaChange to the format expected by alter-generator
          const alterMigrations = generateMigrationsFromChanges(
            alterChanges as unknown as import('@famgia/omnify-atlas').SchemaChange[],
            migrationOptions
          );

          for (const migration of alterMigrations) {
            outputs.push({
              path: getMigrationPathForSchema(migration, ctx.schemas, resolved.migrationsPath),
              content: migration.content,
              type: 'migration' as const,
              metadata: {
                tableName: migration.tables[0],
                migrationType: migration.type,
              },
            });
          }
        }
      } else {
        // No change info - generate CREATE migrations for all schemas
        // but skip tables that already have migrations (deduplication)
        const migrations = generateMigrations(ctx.schemas, migrationOptions);

        for (const migration of migrations) {
          const tableName = migration.tables[0];
          // Check if migration exists in the correct directory (main app or package)
          if (migration.type === 'create' && hasMigration(tableName, migration.schemaName)) {
            ctx.logger.debug(`Skipping migration for ${tableName} (already exists)`);
            continue;
          }

          outputs.push({
            path: getMigrationPathForSchema(migration, ctx.schemas, resolved.migrationsPath),
            content: migration.content,
            type: 'migration' as const,
            metadata: {
              tableName,
              migrationType: migration.type,
            },
          });
        }
      }

      return outputs;
    },
  };

  const modelGenerator = {
    name: 'laravel-models',
    description: 'Generate Eloquent model classes',

    generate: async (ctx: GeneratorContext): Promise<GeneratorOutput[]> => {
      const modelOptions: ModelGeneratorOptions = {
        modelNamespace: resolved.modelNamespace,
        baseModelNamespace: resolved.baseModelNamespace,
        modelPath: resolved.modelsPath,
        baseModelPath: resolved.baseModelsPath,
        providersPath: resolved.providersPath,
        customTypes: ctx.customTypes,
      };

      const models = generateModels(ctx.schemas, modelOptions);
      const outputs: GeneratorOutput[] = models.map((model) => ({
        path: getModelPath(model),
        content: model.content,
        type: 'model' as const,
        // Skip writing user models if they already exist
        skipIfExists: !model.overwrite,
        metadata: {
          modelType: model.type,
          schemaName: model.schemaName,
        },
      }));

      // Generate provider registration
      // Check for Laravel 11+ (bootstrap/providers.php) or Laravel 10- (config/app.php)
      // Infer Laravel root from providersPath (e.g., "./backend/app/Providers" → "./backend")
      const laravelRoot = inferLaravelRoot(resolved.providersPath);
      const bootstrapProvidersRelPath = laravelRoot ? `${laravelRoot}/bootstrap/providers.php` : 'bootstrap/providers.php';
      const configAppRelPath = laravelRoot ? `${laravelRoot}/config/app.php` : 'config/app.php';
      const bootstrapProvidersPath = join(ctx.cwd, bootstrapProvidersRelPath);
      const configAppPath = join(ctx.cwd, configAppRelPath);

      let existingContent: string | null = null;
      let laravelVersion: 'laravel11+' | 'laravel10-';

      if (existsSync(bootstrapProvidersPath)) {
        // Laravel 11+ with bootstrap/providers.php
        laravelVersion = 'laravel11+';
        try {
          existingContent = readFileSync(bootstrapProvidersPath, 'utf-8');
        } catch {
          existingContent = null;
        }
      } else if (existsSync(configAppPath)) {
        // Check if config/app.php has a 'providers' array (Laravel 10-)
        // or is Laravel 11+ format (no providers array)
        try {
          const configContent = readFileSync(configAppPath, 'utf-8');
          if (/'providers'\s*=>\s*\[/.test(configContent)) {
            // Laravel 10- with providers array in config/app.php
            laravelVersion = 'laravel10-';
            existingContent = configContent;
          } else {
            // Laravel 11+ format (config/app.php exists but no providers array)
            laravelVersion = 'laravel11+';
            existingContent = null;
          }
        } catch {
          // Assume Laravel 11+ if can't read config
          laravelVersion = 'laravel11+';
          existingContent = null;
        }
      } else {
        // Assume Laravel 11+ for new projects
        laravelVersion = 'laravel11+';
        existingContent = null;
      }

      const registration = generateProviderRegistration(existingContent, laravelVersion, laravelRoot);

      if (registration && !registration.alreadyRegistered) {
        outputs.push({
          path: registration.path,
          content: registration.content,
          type: 'other' as const,
          skipIfExists: false, // We want to modify the file
          metadata: {
            registrationType: 'provider-registration',
            laravelVersion: registration.laravelVersion,
          },
        });
        ctx.logger.info(`OmnifyServiceProvider will be registered in ${registration.path}`);
      } else if (registration?.alreadyRegistered) {
        ctx.logger.info('OmnifyServiceProvider is already registered');
      }

      return outputs;
    },
  };

  const factoryGenerator = {
    name: 'laravel-factories',
    description: 'Generate Laravel factory classes for testing',

    generate: async (ctx: GeneratorContext): Promise<GeneratorOutput[]> => {
      const factoryOptions: FactoryGeneratorOptions = {
        modelNamespace: resolved.modelNamespace,
        factoryPath: resolved.factoriesPath,
        fakerLocale: resolved.fakerLocale,
        customTypes: ctx.customTypes,
        pluginEnums: ctx.pluginEnums,
      };

      const factories = generateFactories(ctx.schemas, factoryOptions);

      return factories.map((factory) => ({
        path: getFactoryPath(factory),
        content: factory.content,
        type: 'factory' as const,
        // Skip writing factories if they already exist (allow customization)
        skipIfExists: !factory.overwrite,
        metadata: {
          factoryName: factory.name,
          schemaName: factory.schemaName,
        },
      }));
    },
  };

  const requestGenerator = {
    name: 'laravel-requests',
    description: 'Generate Laravel FormRequest classes for validation',

    generate: async (ctx: GeneratorContext): Promise<GeneratorOutput[]> => {
      const requestOptions: RequestGeneratorOptions = {
        requestNamespace: resolved.requestNamespace,
        baseRequestNamespace: resolved.baseRequestNamespace,
        requestPath: resolved.requestsPath,
        baseRequestPath: resolved.baseRequestsPath,
        modelNamespace: resolved.modelNamespace,
        customTypes: ctx.customTypes,
      };

      const requests = generateRequests(ctx.schemas, requestOptions);

      return requests.map((request) => ({
        path: getRequestPath(request),
        content: request.content,
        type: 'other' as const,
        // Skip writing user requests if they already exist
        skipIfExists: !request.overwrite,
        metadata: {
          requestType: request.type,
          schemaName: request.schemaName,
          module: request.module,
        },
      }));
    },
  };

  const resourceGenerator = {
    name: 'laravel-resources',
    description: 'Generate Laravel API Resource classes',

    generate: async (ctx: GeneratorContext): Promise<GeneratorOutput[]> => {
      const resourceOptions: ResourceGeneratorOptions = {
        resourceNamespace: resolved.resourceNamespace,
        baseResourceNamespace: resolved.baseResourceNamespace,
        resourcePath: resolved.resourcesPath,
        baseResourcePath: resolved.baseResourcesPath,
        customTypes: ctx.customTypes,
      };

      const resources = generateResources(ctx.schemas, resourceOptions);

      return resources.map((resource) => ({
        path: getResourcePath(resource),
        content: resource.content,
        type: 'other' as const,
        // Skip writing user resources if they already exist
        skipIfExists: !resource.overwrite,
        metadata: {
          resourceType: resource.type,
          schemaName: resource.schemaName,
          module: resource.module,
        },
      }));
    },
  };

  const aiGuidesGenerator = {
    name: 'laravel-ai-guides',
    description: 'Generate AI assistant guides (Claude, Cursor) for Laravel development',

    generate: async (ctx: GeneratorContext): Promise<GeneratorOutput[]> => {
      // Always regenerate AI guides to ensure:
      // 1. Deleted files are restored
      // 2. Updated guides from omnify-core are synced
      // 3. Idempotent behavior on every `npx omnify generate`

      // Extract package paths from schemas for glob expansion
      const packagePaths = extractPackagePaths(ctx.schemas);

      const result = generateAIGuides(ctx.cwd, {
        modelsPath: resolved.modelsPath,
        migrationsPath: resolved.migrationsPath,
        laravelBasePath: 'app',
        packagePaths,
      });

      const claudeTotal = result.claudeGuides + result.claudeRules + result.claudeChecklists + result.claudeWorkflows + result.claudeAgents + result.claudeOmnify;
      const antigravityTotal = result.antigravityRules || 0;
      const antigravityInfo = antigravityTotal > 0 ? `, ${antigravityTotal} Antigravity rules` : '';
      ctx.logger.info(`Generated ${claudeTotal} Claude files, ${result.cursorRules} Cursor rules${antigravityInfo}`);

      // Return empty outputs since files are written directly by generateAIGuides
      // This is because the files go to .claude/ and .cursor/ which are outside normal output
      return [];
    },
  };

  // Build generators array based on options
  const generators = [migrationGenerator];
  if (resolved.generateModels) {
    generators.push(modelGenerator);
  }
  if (resolved.generateFactories) {
    generators.push(factoryGenerator);
  }
  if (resolved.generateRequests) {
    generators.push(requestGenerator);
  }
  if (resolved.generateResources) {
    generators.push(resourceGenerator);
  }

  // Always add AI guides generator
  generators.push(aiGuidesGenerator);

  return {
    name: '@famgia/omnify-laravel',
    version: '0.0.14',
    configSchema: LARAVEL_CONFIG_SCHEMA,
    generators,
  };
}

// Named export for flexibility
export { laravelPlugin };
