/**
 * Laravel Resource Generator
 *
 * Generates Laravel API Resource classes from Omnify schemas.
 * Creates base resources (auto-generated) and user resources (created once).
 */

import type { LoadedSchema, PropertyDefinition, SchemaCollection, LocalizedString, CustomTypeDefinition, AssociationDefinition } from '@famgia/omnify-types';
import { isLocaleMap } from '@famgia/omnify-types';
import { toSnakeCase, toPascalCase, toCamelCase } from '../utils.js';

/**
 * Options for resource generation.
 */
export interface ResourceGeneratorOptions {
  /**
   * Base resource namespace.
   * @default 'App\\Http\\Resources\\OmnifyBase'
   */
  baseResourceNamespace?: string;

  /**
   * User resource namespace.
   * @default 'App\\Http\\Resources'
   */
  resourceNamespace?: string;

  /**
   * Output path for base resources.
   * @default 'app/Http/Resources/OmnifyBase'
   */
  baseResourcePath?: string;

  /**
   * Output path for user resources.
   * @default 'app/Http/Resources'
   */
  resourcePath?: string;

  /**
   * Custom types registered by plugins.
   */
  customTypes?: ReadonlyMap<string, CustomTypeDefinition>;

  /**
   * Locale for displayName.
   * @default 'en'
   */
  locale?: string;
}

/**
 * Generated resource output.
 */
export interface GeneratedResource {
  /** File path relative to project root */
  path: string;
  /** PHP content */
  content: string;
  /** Resource type */
  type: 'base' | 'user';
  /** Whether to overwrite existing file */
  overwrite: boolean;
  /** Schema name */
  schemaName: string;
  /** Module name (from schema path or empty) */
  module: string;
}

/**
 * Resolved options with defaults.
 */
interface ResolvedOptions {
  baseResourceNamespace: string;
  resourceNamespace: string;
  baseResourcePath: string;
  resourcePath: string;
  customTypes: ReadonlyMap<string, CustomTypeDefinition>;
  locale: string;
}

/**
 * Default options.
 */
const DEFAULT_OPTIONS: ResolvedOptions = {
  baseResourceNamespace: 'App\\Http\\Resources\\OmnifyBase',
  resourceNamespace: 'App\\Http\\Resources',
  baseResourcePath: 'app/Http/Resources/OmnifyBase',
  resourcePath: 'app/Http/Resources',
  customTypes: new Map(),
  locale: 'en',
};

/**
 * Fields to skip when generating resource output.
 */
const SKIP_FIELDS = new Set([
  'password',
  'remember_token',
]);

/**
 * OpenAPI property definition.
 */
interface OpenApiProperty {
  property: string;
  type: string;
  format?: string;
  maxLength?: number;
  nullable?: boolean;
  example?: string | number | boolean;
}

/**
 * Map TypeScript type to OpenAPI type and format.
 */
function mapTsTypeToOpenApi(tsType: string, fieldName: string): { type: string; format?: string } {
  // Check for special field name patterns
  if (fieldName.includes('email')) {
    return { type: 'string', format: 'email' };
  }

  switch (tsType) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    default:
      return { type: 'string' };
  }
}

/**
 * Map Omnify type to OpenAPI type and format.
 */
function getOpenApiType(propDef: PropertyDefinition, fieldName: string): { type: string; format?: string } {
  // Handle date/time types first (before field name checks)
  switch (propDef.type) {
    case 'Date':
      return { type: 'string', format: 'date' };
    case 'DateTime':
    case 'Timestamp':
      return { type: 'string', format: 'date-time' };
  }

  // Check for special field name patterns
  if (fieldName.includes('email') && !fieldName.endsWith('_at')) {
    return { type: 'string', format: 'email' };
  }
  if (fieldName.includes('password')) {
    return { type: 'string', format: 'password' };
  }

  switch (propDef.type) {
    case 'String':
    case 'Text':
    case 'LongText':
      return { type: 'string' };
    case 'Int':
    case 'BigInt':
      return { type: 'integer' };
    case 'Float':
    case 'Decimal':
      return { type: 'number' };
    case 'Boolean':
      return { type: 'boolean' };
    case 'Email':
      return { type: 'string', format: 'email' };
    case 'UUID':
      return { type: 'string', format: 'uuid' };
    case 'JSON':
      return { type: 'object' };
    default:
      return { type: 'string' };
  }
}

/**
 * Generate OpenAPI properties for a schema.
 */
function generateOpenApiProperties(
  schema: LoadedSchema,
  options: ResolvedOptions
): OpenApiProperty[] {
  const properties: OpenApiProperty[] = [];
  const schemaProps = schema.properties ?? {};

  // Always include id first
  if (schema.options?.id !== false) {
    properties.push({
      property: 'id',
      type: 'integer',
      example: 1,
    });
  }

  // Process schema properties
  for (const [propName, propDef] of Object.entries(schemaProps)) {
    const snakeName = toSnakeCase(propName);

    // Skip hidden fields
    if (SKIP_FIELDS.has(snakeName)) continue;
    if ((propDef as { hidden?: boolean }).hidden === true) continue;

    // Skip associations (they're complex nested objects)
    if (propDef.type === 'Association') continue;

    // Handle compound types
    const typeDef = options.customTypes.get(propDef.type);
    if (typeDef?.compound && typeDef.expand) {
      for (const field of typeDef.expand) {
        const suffixSnake = toSnakeCase(field.suffix);
        const fieldName = `${snakeName}_${suffixSnake}`;
        // Get type from typescript definition or default to string
        const tsType = field.typescript?.type ?? 'string';
        const openApiType = mapTsTypeToOpenApi(tsType, fieldName);
        const prop: OpenApiProperty = {
          property: fieldName,
          ...openApiType,
        };
        // Get maxLength from SQL definition if available
        const sqlDef = field.sql as { length?: number } | undefined;
        if (sqlDef?.length) {
          prop.maxLength = sqlDef.length;
        }
        properties.push(prop);
      }
      // Add accessors
      if (typeDef.accessors) {
        for (const accessor of typeDef.accessors) {
          const accessorName = `${snakeName}_${toSnakeCase(accessor.name)}`;
          properties.push({
            property: accessorName,
            type: 'string',
          });
        }
      }
      continue;
    }

    // Regular field
    const openApiType = getOpenApiType(propDef, snakeName);
    const prop: OpenApiProperty = {
      property: snakeName,
      ...openApiType,
    };

    // Add maxLength from length property
    const length = (propDef as { length?: number }).length;
    if (length) {
      prop.maxLength = length;
    }

    // Add nullable
    if ((propDef as { nullable?: boolean }).nullable) {
      prop.nullable = true;
    }

    properties.push(prop);
  }

  // Add timestamps
  if (schema.options?.timestamps !== false) {
    properties.push({
      property: 'created_at',
      type: 'string',
      format: 'date-time',
    });
    properties.push({
      property: 'updated_at',
      type: 'string',
      format: 'date-time',
    });
  }

  // Add soft delete timestamp
  if (schema.options?.softDelete) {
    properties.push({
      property: 'deleted_at',
      type: 'string',
      format: 'date-time',
      nullable: true,
    });
  }

  return properties;
}

/**
 * Format OpenAPI property as PHP attribute.
 */
function formatOpenApiProperty(prop: OpenApiProperty, indent: string): string {
  const parts: string[] = [`property: '${prop.property}'`, `type: '${prop.type}'`];

  if (prop.format) {
    parts.push(`format: '${prop.format}'`);
  }
  if (prop.maxLength) {
    parts.push(`maxLength: ${prop.maxLength}`);
  }
  if (prop.nullable) {
    parts.push(`nullable: true`);
  }
  if (prop.example !== undefined) {
    if (typeof prop.example === 'string') {
      parts.push(`example: '${prop.example}'`);
    } else {
      parts.push(`example: ${prop.example}`);
    }
  }

  return `${indent}new OA\\Property(${parts.join(', ')})`;
}

/**
 * Resolve options with defaults.
 */
function resolveOptions(options?: ResourceGeneratorOptions): ResolvedOptions {
  return {
    baseResourceNamespace: options?.baseResourceNamespace ?? DEFAULT_OPTIONS.baseResourceNamespace,
    resourceNamespace: options?.resourceNamespace ?? DEFAULT_OPTIONS.resourceNamespace,
    baseResourcePath: options?.baseResourcePath ?? DEFAULT_OPTIONS.baseResourcePath,
    resourcePath: options?.resourcePath ?? DEFAULT_OPTIONS.resourcePath,
    customTypes: options?.customTypes ?? new Map(),
    locale: options?.locale ?? DEFAULT_OPTIONS.locale,
  };
}

/**
 * Escape string for PHP single-quoted string.
 */
function escapePhpString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Get module name from schema.
 */
function getModuleName(schema: LoadedSchema): string {
  if ((schema as any).module) {
    return (schema as any).module;
  }
  return '';
}

/**
 * Get the PHP output expression for a field based on its type.
 * For date/time fields, always use ?-> for safe null handling.
 */
function getFieldExpression(fieldName: string, propDef: PropertyDefinition): string {
  switch (propDef.type) {
    case 'Date':
      return `$this->${fieldName}?->toDateString()`;
    case 'DateTime':
    case 'Timestamp':
      return `$this->${fieldName}?->toISOString()`;
    default:
      return `$this->${fieldName}`;
  }
}

/**
 * Get resource field output for a property.
 */
function getPropertyOutput(
  propName: string,
  propDef: PropertyDefinition,
  schemas: SchemaCollection,
  options: ResolvedOptions
): string[] {
  const snakeName = toSnakeCase(propName);
  const lines: string[] = [];

  // Skip hidden fields
  if (SKIP_FIELDS.has(snakeName)) {
    return lines;
  }

  // Handle associations
  if (propDef.type === 'Association') {
    const assoc = propDef as AssociationDefinition;
    const targetClass = assoc.target ? toPascalCase(assoc.target) : '';

    switch (assoc.relation) {
      case 'ManyToOne':
      case 'OneToOne':
        // Include FK and optionally loaded relation
        lines.push(`            '${snakeName}_id' => $this->${snakeName}_id,`);
        lines.push(`            '${snakeName}' => $this->whenLoaded('${toCamelCase(propName)}', fn() => new ${targetClass}Resource($this->${toCamelCase(propName)})),`);
        break;
      case 'OneToMany':
      case 'ManyToMany':
        lines.push(`            '${snakeName}' => $this->whenLoaded('${toCamelCase(propName)}', fn() => ${targetClass}Resource::collection($this->${toCamelCase(propName)})),`);
        break;
      case 'MorphTo':
        lines.push(`            '${snakeName}_type' => $this->${snakeName}_type,`);
        lines.push(`            '${snakeName}_id' => $this->${snakeName}_id,`);
        lines.push(`            '${snakeName}' => $this->whenLoaded('${toCamelCase(propName)}'),`);
        break;
      case 'MorphOne':
      case 'MorphMany':
        lines.push(`            '${snakeName}' => $this->whenLoaded('${toCamelCase(propName)}', fn() => ${targetClass}Resource::collection($this->${toCamelCase(propName)})),`);
        break;
    }
    return lines;
  }

  // Handle compound types
  const typeDef = options.customTypes.get(propDef.type);
  if (typeDef?.compound && typeDef.expand) {
    for (const field of typeDef.expand) {
      const suffixSnake = toSnakeCase(field.suffix);
      const fieldName = `${snakeName}_${suffixSnake}`;
      lines.push(`            '${fieldName}' => $this->${fieldName},`);
    }
    // Add accessor if exists
    if (typeDef.accessors) {
      for (const accessor of typeDef.accessors) {
        const accessorName = `${snakeName}_${toSnakeCase(accessor.name)}`;
        lines.push(`            '${accessorName}' => $this->${accessorName},`);
      }
    }
    return lines;
  }

  // Regular fields - apply date/time formatting
  const expression = getFieldExpression(snakeName, propDef);
  lines.push(`            '${snakeName}' => ${expression},`);
  return lines;
}

/**
 * Generate Resource Base class.
 */
function generateResourceBase(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): GeneratedResource {
  const className = toPascalCase(schema.name);
  const module = getModuleName(schema);
  const namespaceModule = module ? `\\${module}` : '';
  const namespace = `${options.baseResourceNamespace}${namespaceModule}`;

  const properties = schema.properties ?? {};
  const outputLines: string[] = [];
  const imports: Set<string> = new Set();

  // Always include id
  if (schema.options?.id !== false) {
    outputLines.push(`            'id' => $this->id,`);
  }

  // Process properties
  for (const [propName, propDef] of Object.entries(properties)) {
    const lines = getPropertyOutput(propName, propDef, schemas, options);
    outputLines.push(...lines);

    // Collect imports for related resources
    if (propDef.type === 'Association') {
      const assoc = propDef as AssociationDefinition;
      if (assoc.target) {
        const targetModule = getModuleName(schemas[assoc.target] ?? schema);
        const targetModuleNs = targetModule ? `\\${targetModule}` : '';
        imports.add(`use ${options.resourceNamespace}${targetModuleNs}\\${toPascalCase(assoc.target)}Resource;`);
      }
    }
  }

  // Add timestamps
  if (schema.options?.timestamps !== false) {
    outputLines.push(`            'created_at' => $this->created_at?->toISOString(),`);
    outputLines.push(`            'updated_at' => $this->updated_at?->toISOString(),`);
  }

  // Add soft delete
  if (schema.options?.softDelete) {
    outputLines.push(`            'deleted_at' => $this->deleted_at?->toISOString(),`);
  }

  const importLines = Array.from(imports).sort().join('\n');
  const importBlock = importLines ? `\n${importLines}` : '';

  const content = `<?php

/**
 * ⚠️ DO NOT EDIT THIS FILE! ⚠️
 * このファイルを編集しないでください！
 * KHÔNG ĐƯỢC SỬA FILE NÀY!
 *
 * This file is AUTO-GENERATED by Omnify from schema: ${schema.name}
 * Any manual changes will be OVERWRITTEN on next generation.
 *
 * To modify: Edit the schema YAML file and run: npx omnify generate
 *
 * @generated by @famgia/omnify-laravel
 */

namespace ${namespace};

use Illuminate\\Http\\Request;
use Illuminate\\Http\\Resources\\Json\\JsonResource;${importBlock}

class ${className}ResourceBase extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    protected function schemaArray(Request $request): array
    {
        return [
${outputLines.join('\n')}
        ];
    }
}
`;

  const modulePath = module ? `/${module}` : '';
  return {
    path: `${options.baseResourcePath}${modulePath}/${className}ResourceBase.php`,
    content,
    type: 'base',
    overwrite: true,
    schemaName: schema.name,
    module,
  };
}

/**
 * Generate Resource (user-editable).
 */
function generateResource(
  schema: LoadedSchema,
  options: ResolvedOptions
): GeneratedResource {
  const className = toPascalCase(schema.name);
  const module = getModuleName(schema);
  const namespaceModule = module ? `\\${module}` : '';
  const namespace = `${options.resourceNamespace}${namespaceModule}`;
  const baseNamespace = `${options.baseResourceNamespace}${namespaceModule}`;

  // Generate OpenAPI properties
  const openApiProps = generateOpenApiProperties(schema, options);
  const propsIndent = '        ';
  const openApiPropsFormatted = openApiProps
    .map(prop => formatOpenApiProperty(prop, propsIndent))
    .join(',\n');

  // Get description from displayName or use default
  const description = schema.displayName
    ? (typeof schema.displayName === 'string' ? schema.displayName : schema.displayName['en'] ?? schema.name)
    : `${schema.name} resource`;

  const content = `<?php

/**
 * ${className} Resource
 *
 * SAFE TO EDIT - This file is never overwritten by Omnify.
 */

namespace ${namespace};

use Illuminate\\Http\\Request;
use OpenApi\\Attributes as OA;
use ${baseNamespace}\\${className}ResourceBase;

#[OA\\Schema(
    schema: '${schema.name}',
    description: '${escapePhpString(description)}',
    properties: [
${openApiPropsFormatted},
    ]
)]
class ${className}Resource extends ${className}ResourceBase
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return array_merge($this->schemaArray($request), [
            // Custom fields here
        ]);
    }

    /**
     * Get additional data that should be returned with the resource array.
     *
     * @return array<string, mixed>
     */
    public function with(Request $request): array
    {
        return [
            // Additional metadata here
        ];
    }
}
`;

  const modulePath = module ? `/${module}` : '';
  return {
    path: `${options.resourcePath}${modulePath}/${className}Resource.php`,
    content,
    type: 'user',
    overwrite: false,
    schemaName: schema.name,
    module,
  };
}

/**
 * Generate all Resource classes for the given schemas.
 */
export function generateResources(
  schemas: SchemaCollection,
  options?: ResourceGeneratorOptions
): GeneratedResource[] {
  const resolved = resolveOptions(options);
  const resources: GeneratedResource[] = [];

  for (const schema of Object.values(schemas)) {
    // Skip enums
    if (schema.kind === 'enum') continue;

    // Skip hidden schemas
    if (schema.options?.hidden === true) continue;

    // Generate base resource (always overwritten)
    resources.push(generateResourceBase(schema, schemas, resolved));

    // Generate user resource (created once)
    resources.push(generateResource(schema, resolved));
  }

  return resources;
}

/**
 * Get the output path for a resource.
 */
export function getResourcePath(resource: GeneratedResource): string {
  return resource.path;
}
