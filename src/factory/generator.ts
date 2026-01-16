/**
 * Laravel Factory Generator
 *
 * Generates Laravel factory files for Eloquent models.
 */

import type { SchemaCollection, LoadedSchema, PropertyDefinition, CustomTypeDefinition, PluginEnumDefinition } from '@famgia/omnify-types';
import { toPascalCase, toSnakeCase } from '../utils.js';

/**
 * Options for factory generation.
 */
export interface FactoryGeneratorOptions {
  /** Model namespace */
  modelNamespace?: string;
  /** Factory output path */
  factoryPath?: string;
  /** Faker locale */
  fakerLocale?: string;
  /** Custom types registered by plugins */
  customTypes?: ReadonlyMap<string, CustomTypeDefinition>;
  /** Plugin enums from registry (for enumRef resolution) */
  pluginEnums?: ReadonlyMap<string, PluginEnumDefinition>;
}

/**
 * Generated factory output.
 */
export interface GeneratedFactory {
  /** Factory class name */
  name: string;
  /** Schema name this factory is for */
  schemaName: string;
  /** Output path for the factory file */
  path: string;
  /** Generated factory content */
  content: string;
  /** Whether to overwrite if exists */
  overwrite: boolean;
}

/**
 * Resolved options with defaults applied.
 */
interface ResolvedOptions {
  modelNamespace: string;
  factoryPath: string;
  fakerLocale: string;
  customTypes: ReadonlyMap<string, CustomTypeDefinition>;
  pluginEnums: ReadonlyMap<string, PluginEnumDefinition>;
}

/**
 * Resolves options with defaults.
 */
function resolveOptions(options?: FactoryGeneratorOptions): ResolvedOptions {
  return {
    modelNamespace: options?.modelNamespace ?? 'App\\Models',
    factoryPath: options?.factoryPath ?? 'database/factories',
    fakerLocale: options?.fakerLocale ?? 'en_US',
    customTypes: options?.customTypes ?? new Map(),
    pluginEnums: options?.pluginEnums ?? new Map(),
  };
}

/**
 * スキーマのpackageOutputに基づいてオプションを解決
 */
function resolveSchemaOptions(schema: LoadedSchema, globalOptions: ResolvedOptions): ResolvedOptions {
  const pkgOutput = schema.packageOutput?.laravel;
  if (!pkgOutput) {
    return globalOptions;
  }

  const base = pkgOutput.base;
  return {
    ...globalOptions,
    modelNamespace: pkgOutput.modelsNamespace,
    factoryPath: `${base}/${pkgOutput.factoriesPath ?? 'database/factories'}`,
  };
}

/**
 * Gets the factory stub content.
 */
function getStubContent(): string {
  return `<?php

namespace Database\\Factories;

use {{MODEL_NAMESPACE}}\\{{MODEL_NAME}};
use Illuminate\\Database\\Eloquent\\Factories\\Factory;
{{IMPORTS}}

/**
 * @extends Factory<{{MODEL_NAME}}>
 */
class {{MODEL_NAME}}Factory extends Factory
{
    protected $model = {{MODEL_NAME}}::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
{{ATTRIBUTES}}
        ];
    }
}
`;
}

/**
 * Generates fake data for Japanese compound types.
 * Returns array of field definitions or null if not a Japanese type.
 */
function generateJapaneseCompoundFake(
  propertyName: string,
  property: PropertyDefinition,
  options: ResolvedOptions
): string[] | null {
  const typeDef = options.customTypes.get(property.type);
  if (!typeDef || !typeDef.compound || !typeDef.expand) {
    return null;
  }

  const snakeName = toSnakeCase(propertyName);
  const lines: string[] = [];
  const jaFaker = "fake('ja_JP')";

  switch (property.type) {
    case 'JapaneseName':
      lines.push(`'${snakeName}_lastname' => ${jaFaker}->lastName(),`);
      lines.push(`'${snakeName}_firstname' => ${jaFaker}->firstName(),`);
      lines.push(`'${snakeName}_kana_lastname' => ${jaFaker}->lastKanaName(),`);
      lines.push(`'${snakeName}_kana_firstname' => ${jaFaker}->firstKanaName(),`);
      break;

    case 'JapaneseAddress': {
      lines.push(`'${snakeName}_postal_code' => ${jaFaker}->postcode(),`);
      // Prefecture is now a native ENUM column with keys like 'tokyo', 'osaka', etc.
      const prefectureEnum = options.pluginEnums.get('Prefecture');
      if (prefectureEnum && prefectureEnum.values.length > 0) {
        // Use actual enum keys from plugin
        const keys = prefectureEnum.values.map(v => `'${v.value}'`).join(', ');
        lines.push(`'${snakeName}_prefecture' => fake()->randomElement([${keys}]),`);
      } else {
        // Fallback: hardcoded prefecture keys
        lines.push(`'${snakeName}_prefecture' => fake()->randomElement(['hokkaido', 'aomori', 'iwate', 'miyagi', 'akita', 'yamagata', 'fukushima', 'ibaraki', 'tochigi', 'gunma', 'saitama', 'chiba', 'tokyo', 'kanagawa', 'niigata', 'toyama', 'ishikawa', 'fukui', 'yamanashi', 'nagano', 'gifu', 'shizuoka', 'aichi', 'mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara', 'wakayama', 'tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi', 'tokushima', 'kagawa', 'ehime', 'kochi', 'fukuoka', 'saga', 'nagasaki', 'kumamoto', 'oita', 'miyazaki', 'kagoshima', 'okinawa']),`);
      }
      lines.push(`'${snakeName}_address1' => ${jaFaker}->city() . ${jaFaker}->ward(),`);
      lines.push(`'${snakeName}_address2' => ${jaFaker}->streetAddress(),`);
      lines.push(`'${snakeName}_address3' => ${jaFaker}->optional()->secondaryAddress(),`);
      break;
    }

    case 'JapaneseBankAccount':
      lines.push(`'${snakeName}_bank_code' => ${jaFaker}->regexify('[0-9]{4}'),`);
      lines.push(`'${snakeName}_branch_code' => ${jaFaker}->regexify('[0-9]{3}'),`);
      lines.push(`'${snakeName}_account_type' => ${jaFaker}->randomElement(['1', '2', '4']),`);
      lines.push(`'${snakeName}_account_number' => ${jaFaker}->regexify('[0-9]{7}'),`);
      lines.push(`'${snakeName}_account_holder' => ${jaFaker}->lastKanaName() . ' ' . ${jaFaker}->firstKanaName(),`);
      break;

    default:
      // For other compound types, generate default string fakes
      for (const field of typeDef.expand) {
        const suffixSnake = toSnakeCase(field.suffix);
        const fieldName = `${snakeName}_${suffixSnake}`;
        const sql = (field as any).sql;
        if (sql?.sqlType === 'TINYINT' || sql?.sqlType === 'INT' || sql?.sqlType === 'BIGINT') {
          lines.push(`'${fieldName}' => fake()->numberBetween(1, 100),`);
        } else {
          lines.push(`'${fieldName}' => fake()->words(2, true),`);
        }
      }
      break;
  }

  return lines;
}

/**
 * Generates fake data for Japanese non-compound types.
 */
function generateJapaneseSimpleFake(
  propertyName: string,
  property: PropertyDefinition
): string | null {
  const snakeName = toSnakeCase(propertyName);
  const jaFaker = "fake('ja_JP')";

  switch (property.type) {
    case 'JapanesePhone':
      return `'${snakeName}' => ${jaFaker}->phoneNumber(),`;

    case 'JapanesePostalCode':
      return `'${snakeName}' => ${jaFaker}->postcode(),`;

    default:
      return null;
  }
}

/**
 * Generates factory fake data for a property based on its type and name.
 */
function generateFakeData(
  propertyName: string,
  property: PropertyDefinition,
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): string | null {
  const type = property.type;

  // Skip system fields
  if (['deleted_at', 'created_at', 'updated_at'].includes(propertyName)) {
    return null;
  }

  // Skip association properties (foreign keys are handled separately)
  if (type === 'Association') {
    return null;
  }

  // Check for Japanese non-compound types first
  const japaneseFake = generateJapaneseSimpleFake(propertyName, property);
  if (japaneseFake) {
    return japaneseFake;
  }

  // Handle different property types
  switch (type) {
    case 'String':
      return generateStringFake(propertyName, property);

    case 'Email':
      return `'${propertyName}' => fake()->unique()->safeEmail(),`;

    case 'Password':
      return `'${propertyName}' => bcrypt('password'),`;

    case 'Int':
    case 'BigInt':
      return generateIntFake(propertyName, property);

    case 'Float':
    case 'Decimal':
      return `'${propertyName}' => fake()->randomFloat(2, 1, 10000),`;

    case 'Boolean':
      return `'${propertyName}' => fake()->boolean(),`;

    case 'Text':
      return `'${propertyName}' => fake()->paragraphs(3, true),`;

    case 'LongText':
      return `'${propertyName}' => fake()->paragraphs(5, true),`;

    case 'Date':
      return `'${propertyName}' => fake()->date(),`;

    case 'Time':
      return `'${propertyName}' => fake()->time(),`;

    case 'Timestamp':
    case 'DateTime':
      return `'${propertyName}' => fake()->dateTime(),`;

    case 'Json':
      return `'${propertyName}' => [],`;

    case 'Enum':
      return generateEnumFake(propertyName, property);

    case 'EnumRef':
      return generateEnumRefFake(propertyName, property, schemas);

    default:
      // Default to sentence for unknown types
      return `'${propertyName}' => fake()->sentence(),`;
  }
}

/**
 * Generates fake data for String type based on property name patterns.
 */
function generateStringFake(propertyName: string, property: PropertyDefinition): string {
  // Handle special field names
  if (propertyName === 'slug') {
    // Use slug(2) to generate shorter slugs (avoid exceeding database column length)
    return `'${propertyName}' => fake()->unique()->slug(2),`;
  }

  if (propertyName === 'uuid' || propertyName === 'uid') {
    return `'${propertyName}' => (string) \\Illuminate\\Support\\Str::uuid(),`;
  }

  if (propertyName.includes('email')) {
    return `'${propertyName}' => fake()->unique()->safeEmail(),`;
  }

  if (propertyName.includes('phone')) {
    return `'${propertyName}' => fake()->phoneNumber(),`;
  }

  // Check image/photo/avatar before url to handle cases like 'avatar_url'
  if (propertyName.includes('image') || propertyName.includes('photo') || propertyName.includes('avatar')) {
    return `'${propertyName}' => fake()->imageUrl(),`;
  }

  if (propertyName.includes('url') || propertyName.includes('website')) {
    return `'${propertyName}' => fake()->url(),`;
  }

  if (propertyName.includes('path') || propertyName.includes('file')) {
    return `'${propertyName}' => 'uploads/' . fake()->uuid() . '.jpg',`;
  }

  if (propertyName === 'name' || propertyName === 'title') {
    return `'${propertyName}' => fake()->sentence(3),`;
  }

  if (propertyName.includes('name')) {
    return `'${propertyName}' => fake()->name(),`;
  }

  if (propertyName.includes('address')) {
    return `'${propertyName}' => fake()->address(),`;
  }

  if (propertyName.includes('city')) {
    return `'${propertyName}' => fake()->city(),`;
  }

  if (propertyName.includes('country')) {
    return `'${propertyName}' => fake()->country(),`;
  }

  if (propertyName.includes('zip') || propertyName.includes('postal')) {
    return `'${propertyName}' => fake()->postcode(),`;
  }

  if (propertyName.includes('color')) {
    return `'${propertyName}' => fake()->hexColor(),`;
  }

  if (propertyName.includes('token') || propertyName.includes('secret') || propertyName.includes('key')) {
    return `'${propertyName}' => \\Illuminate\\Support\\Str::random(32),`;
  }

  if (propertyName.includes('code')) {
    return `'${propertyName}' => fake()->unique()->regexify('[A-Z0-9]{8}'),`;
  }

  // Default string
  const length = (property as { length?: number }).length;
  if (length && length <= 50) {
    return `'${propertyName}' => fake()->words(3, true),`;
  }

  return `'${propertyName}' => fake()->sentence(),`;
}

/**
 * Generates fake data for Integer types.
 * unique制約がある場合はunique()を使用して重複を回避
 */
function generateIntFake(propertyName: string, property: PropertyDefinition): string {
  // unique制約がある場合はunique()を使用（AssociationDefinitionにはuniqueがないためチェック）
  const isUnique = 'unique' in property && property.unique === true;
  const uniquePrefix = isUnique ? 'unique()->' : '';

  if (propertyName.includes('count') || propertyName.includes('quantity')) {
    return `'${propertyName}' => fake()->${uniquePrefix}numberBetween(0, 100),`;
  }

  if (propertyName.includes('price') || propertyName.includes('amount') || propertyName.includes('cost')) {
    return `'${propertyName}' => fake()->${uniquePrefix}numberBetween(100, 10000),`;
  }

  if (propertyName.includes('order') || propertyName.includes('sort') || propertyName.includes('position')) {
    return `'${propertyName}' => fake()->${uniquePrefix}numberBetween(1, 100),`;
  }

  if (propertyName.includes('age')) {
    return `'${propertyName}' => fake()->${uniquePrefix}numberBetween(18, 80),`;
  }

  if (propertyName.includes('year')) {
    return `'${propertyName}' => fake()->${uniquePrefix}year(),`;
  }

  // unique制約がある場合は範囲を広げて衝突を減らす
  const range = isUnique ? '1, 1000000' : '1, 1000';
  return `'${propertyName}' => fake()->${uniquePrefix}numberBetween(${range}),`;
}

/**
 * Generates fake data for inline Enum type.
 */
function generateEnumFake(propertyName: string, property: PropertyDefinition): string {
  const enumValues = (property as { enum?: readonly (string | { value: string })[] }).enum;
  if (!enumValues || enumValues.length === 0) {
    return `'${propertyName}' => null,`;
  }

  // Extract values (handle both string and object formats)
  const values = enumValues.map(v => typeof v === 'string' ? v : v.value);
  const valuesStr = values.map(v => `'${v}'`).join(', ');

  return `'${propertyName}' => fake()->randomElement([${valuesStr}]),`;
}

/**
 * Generates fake data for EnumRef type.
 */
function generateEnumRefFake(
  propertyName: string,
  property: PropertyDefinition,
  schemas: SchemaCollection
): string {
  const enumName = (property as { enum?: string }).enum;
  if (!enumName) {
    return `'${propertyName}' => null,`;
  }

  const enumSchema = schemas[enumName];
  if (!enumSchema || enumSchema.kind !== 'enum' || !enumSchema.values) {
    return `'${propertyName}' => null,`;
  }

  const valuesStr = enumSchema.values.map(v => `'${v}'`).join(', ');
  return `'${propertyName}' => fake()->randomElement([${valuesStr}]),`;
}

/**
 * Generates factory data for association (foreign key).
 */
function generateAssociationFake(
  propertyName: string,
  property: PropertyDefinition,
  schema: LoadedSchema,
  schemas: SchemaCollection,
  modelNamespace: string
): { fake: string; import?: string } | null {
  if (property.type !== 'Association') {
    return null;
  }

  const relation = (property as { relation?: string }).relation;
  const target = (property as { target?: string }).target;

  // Only handle ManyToOne (belongsTo) relationships
  if (relation !== 'ManyToOne' || !target) {
    return null;
  }

  const foreignKey = `${toSnakeCase(propertyName)}_id`;
  const isNullable = (property as { nullable?: boolean }).nullable ?? false;
  const targetSchema = schemas[target];

  // Check if target schema exists
  if (!targetSchema) {
    return null;
  }

  // Generate the fake data
  let fake: string;
  if (isNullable) {
    fake = `'${foreignKey}' => ${target}::query()->inRandomOrder()->first()?->id,`;
  } else {
    fake = `'${foreignKey}' => ${target}::query()->inRandomOrder()->first()?->id ?? ${target}::factory()->create()->id,`;
  }

  // Add import if target is different from current schema
  let importStatement: string | undefined;
  if (target !== schema.name) {
    importStatement = `use ${modelNamespace}\\${target};`;
  }

  return { fake, import: importStatement };
}

/**
 * Generates a factory for a single schema.
 */
function generateFactory(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions,
  stubContent: string
): GeneratedFactory | null {
  // Skip enum schemas
  if (schema.kind === 'enum') {
    return null;
  }

  // Skip hidden schemas (system tables like cache, jobs, sessions)
  if (schema.options?.hidden) {
    return null;
  }

  const modelName = toPascalCase(schema.name);
  const factoryName = `${modelName}Factory`;

  const attributes: string[] = [];
  const imports: string[] = [];

  // Process properties
  if (schema.properties) {
    for (const [propName, prop] of Object.entries(schema.properties)) {
      // Handle associations (foreign keys)
      if (prop.type === 'Association') {
        const assocResult = generateAssociationFake(propName, prop, schema, schemas, options.modelNamespace);
        if (assocResult) {
          attributes.push(assocResult.fake);
          if (assocResult.import) {
            imports.push(assocResult.import);
          }
        }
        continue;
      }

      // Handle Japanese compound types (JapaneseName, JapaneseAddress, JapaneseBankAccount)
      const compoundFakes = generateJapaneseCompoundFake(propName, prop, options);
      if (compoundFakes) {
        attributes.push(...compoundFakes);
        continue;
      }

      // Handle regular properties
      const fake = generateFakeData(propName, prop, schema, schemas, options);
      if (fake) {
        attributes.push(fake);
      }
    }
  }

  // Build the factory content
  let content = stubContent;
  content = content.replace(/\{\{MODEL_NAMESPACE\}\}/g, options.modelNamespace);
  content = content.replace(/\{\{MODEL_NAME\}\}/g, modelName);

  // Format imports
  const uniqueImports = [...new Set(imports)];
  const importsStr = uniqueImports.length > 0
    ? '\n' + uniqueImports.join('\n')
    : '';
  content = content.replace(/\{\{IMPORTS\}\}/g, importsStr);

  // Format attributes with proper indentation
  const attributesStr = attributes.length > 0
    ? attributes.map(a => `            ${a}`).join('\n')
    : '';
  content = content.replace(/\{\{ATTRIBUTES\}\}/g, attributesStr);

  return {
    name: factoryName,
    schemaName: schema.name,
    path: `${options.factoryPath}/${factoryName}.php`,
    content,
    overwrite: false, // Factories should not overwrite existing files
  };
}

/**
 * Generates factories for all schemas.
 */
export function generateFactories(
  schemas: SchemaCollection,
  options?: FactoryGeneratorOptions
): GeneratedFactory[] {
  const globalResolved = resolveOptions(options);
  const stubContent = getStubContent();
  const factories: GeneratedFactory[] = [];

  for (const schema of Object.values(schemas)) {
    // スキーマごとのオプションを解決（packageOutput考慮）
    const schemaResolved = resolveSchemaOptions(schema, globalResolved);
    const factory = generateFactory(schema, schemas, schemaResolved, stubContent);
    if (factory) {
      factories.push(factory);
    }
  }

  return factories;
}

/**
 * Gets the output path for a factory.
 */
export function getFactoryPath(factory: GeneratedFactory): string {
  return factory.path;
}
