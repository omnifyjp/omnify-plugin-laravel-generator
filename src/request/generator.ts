/**
 * Laravel FormRequest Generator
 *
 * Generates Laravel FormRequest classes from Omnify schemas.
 * Creates base requests (auto-generated) and user requests (created once).
 */

import type { LoadedSchema, PropertyDefinition, SchemaCollection, LocalizedString, CustomTypeDefinition, AssociationDefinition } from '@famgia/omnify-types';
import { isLocaleMap } from '@famgia/omnify-types';
import { pluralize, toSnakeCase, toPascalCase } from '../utils.js';

/**
 * Options for request generation.
 */
export interface RequestGeneratorOptions {
  /**
   * Base request namespace.
   * @default 'App\\Http\\Requests\\OmnifyBase'
   */
  baseRequestNamespace?: string;

  /**
   * User request namespace.
   * @default 'App\\Http\\Requests'
   */
  requestNamespace?: string;

  /**
   * Output path for base requests.
   * @default 'app/Http/Requests/OmnifyBase'
   */
  baseRequestPath?: string;

  /**
   * Output path for user requests.
   * @default 'app/Http/Requests'
   */
  requestPath?: string;

  /**
   * Model namespace for exists rules.
   * @default 'App\\Models'
   */
  modelNamespace?: string;

  /**
   * Custom types registered by plugins.
   */
  customTypes?: ReadonlyMap<string, CustomTypeDefinition>;

  /**
   * Locale for displayName (used in attributes).
   * @default 'en'
   */
  locale?: string;
}

/**
 * Generated request output.
 */
export interface GeneratedRequest {
  /** File path relative to project root */
  path: string;
  /** PHP content */
  content: string;
  /** Request type */
  type: 'store-base' | 'update-base' | 'store' | 'update';
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
  baseRequestNamespace: string;
  requestNamespace: string;
  baseRequestPath: string;
  requestPath: string;
  modelNamespace: string;
  customTypes: ReadonlyMap<string, CustomTypeDefinition>;
  locale: string;
}

/**
 * Default options.
 */
const DEFAULT_OPTIONS: ResolvedOptions = {
  baseRequestNamespace: 'App\\Http\\Requests\\OmnifyBase',
  requestNamespace: 'App\\Http\\Requests',
  baseRequestPath: 'app/Http/Requests/OmnifyBase',
  requestPath: 'app/Http/Requests',
  modelNamespace: 'App\\Models',
  customTypes: new Map(),
  locale: 'en',
};

/**
 * Fields to skip when generating validation rules.
 */
const SKIP_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'remember_token',
  'email_verified_at',
]);

/**
 * OpenAPI property definition for requests.
 */
interface RequestOpenApiProperty {
  property: string;
  type: string;
  format?: string;
  maxLength?: number;
  minLength?: number;
  nullable?: boolean;
  enum?: string[];
  example?: string | number | boolean;
}

/**
 * Get example value based on field name pattern.
 */
function getExampleValue(fieldName: string, type: string): string | number | boolean | undefined {
  // Japanese name patterns
  if (fieldName.endsWith('_lastname') && !fieldName.includes('kana')) {
    return '田中';
  }
  if (fieldName.endsWith('_firstname') && !fieldName.includes('kana')) {
    return '太郎';
  }
  if (fieldName.includes('kana_lastname') || fieldName.endsWith('_kana_lastname')) {
    return 'タナカ';
  }
  if (fieldName.includes('kana_firstname') || fieldName.endsWith('_kana_firstname')) {
    return 'タロウ';
  }

  // Email
  if (fieldName.includes('email')) {
    return 'user@example.com';
  }

  // Password
  if (fieldName.includes('password')) {
    return 'password123';
  }

  // URL
  if (fieldName.includes('url') || fieldName.includes('website')) {
    return 'https://example.com';
  }

  // ID fields
  if (fieldName.endsWith('_id')) {
    return 1;
  }

  // DateTime fields
  if (fieldName.endsWith('_at')) {
    return '2024-01-01T00:00:00Z';
  }

  // Boolean
  if (type === 'boolean') {
    return true;
  }

  // Integer
  if (type === 'integer') {
    return 1;
  }

  return undefined;
}

/**
 * Map validation type to OpenAPI type.
 */
function mapValidationToOpenApiType(rules: string[], fieldName: string): { type: string; format?: string } {
  // Check field name patterns first
  if (fieldName.includes('email')) {
    return { type: 'string', format: 'email' };
  }
  if (fieldName.includes('password')) {
    return { type: 'string', format: 'password' };
  }
  if (fieldName.includes('url') || fieldName.includes('website')) {
    return { type: 'string', format: 'uri' };
  }

  // Check validation rules
  for (const rule of rules) {
    if (rule === "'integer'") {
      return { type: 'integer' };
    }
    if (rule === "'boolean'") {
      return { type: 'boolean' };
    }
    if (rule === "'numeric'") {
      return { type: 'number' };
    }
    if (rule === "'array'") {
      return { type: 'array' };
    }
    if (rule === "'email'") {
      return { type: 'string', format: 'email' };
    }
    if (rule === "'url'") {
      return { type: 'string', format: 'uri' };
    }
    if (rule === "'date'") {
      // Check if it looks like datetime
      if (fieldName.endsWith('_at')) {
        return { type: 'string', format: 'date-time' };
      }
      return { type: 'string', format: 'date' };
    }
  }

  return { type: 'string' };
}

/**
 * Extract constraints from validation rules.
 */
function extractConstraints(rules: string[]): { maxLength?: number; minLength?: number; nullable?: boolean; enum?: string[] } {
  const constraints: { maxLength?: number; minLength?: number; nullable?: boolean; enum?: string[] } = {};

  for (const rule of rules) {
    // max:N
    const maxMatch = rule.match(/'max:(\d+)'/);
    if (maxMatch) {
      constraints.maxLength = parseInt(maxMatch[1], 10);
    }

    // min:N (for strings)
    const minMatch = rule.match(/'min:(\d+)'/);
    if (minMatch) {
      constraints.minLength = parseInt(minMatch[1], 10);
    }

    // nullable
    if (rule === "'nullable'") {
      constraints.nullable = true;
    }

    // Rule::in([...])
    const inMatch = rule.match(/Rule::in\(\[([^\]]+)\]\)/);
    if (inMatch) {
      const values = inMatch[1].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
      constraints.enum = values;
    }
  }

  return constraints;
}

/**
 * Format OpenAPI property for request as PHP attribute.
 */
function formatRequestOpenApiProperty(prop: RequestOpenApiProperty, indent: string): string {
  const parts: string[] = [`property: '${prop.property}'`, `type: '${prop.type}'`];

  if (prop.format) {
    parts.push(`format: '${prop.format}'`);
  }
  if (prop.maxLength) {
    parts.push(`maxLength: ${prop.maxLength}`);
  }
  if (prop.minLength) {
    parts.push(`minLength: ${prop.minLength}`);
  }
  if (prop.nullable) {
    parts.push(`nullable: true`);
  }
  if (prop.enum) {
    const enumStr = prop.enum.map(v => `'${v}'`).join(', ');
    parts.push(`enum: [${enumStr}]`);
  }
  if (prop.example !== undefined) {
    if (typeof prop.example === 'string') {
      parts.push(`example: '${escapePhpString(prop.example)}'`);
    } else {
      parts.push(`example: ${prop.example}`);
    }
  }

  return `${indent}new OA\\Property(${parts.join(', ')})`;
}

/**
 * Resolve options with defaults.
 */
function resolveOptions(options?: RequestGeneratorOptions): ResolvedOptions {
  return {
    baseRequestNamespace: options?.baseRequestNamespace ?? DEFAULT_OPTIONS.baseRequestNamespace,
    requestNamespace: options?.requestNamespace ?? DEFAULT_OPTIONS.requestNamespace,
    baseRequestPath: options?.baseRequestPath ?? DEFAULT_OPTIONS.baseRequestPath,
    requestPath: options?.requestPath ?? DEFAULT_OPTIONS.requestPath,
    modelNamespace: options?.modelNamespace ?? DEFAULT_OPTIONS.modelNamespace,
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
 * Get display name from LocalizedString.
 */
function getDisplayName(displayName: LocalizedString | undefined, locale: string, fallback: string): string {
  if (!displayName) return fallback;
  if (typeof displayName === 'string') return displayName;
  if (isLocaleMap(displayName)) {
    return displayName[locale] ?? displayName['en'] ?? fallback;
  }
  return fallback;
}

/**
 * Get module name from schema (based on schema path or options).
 */
function getModuleName(schema: LoadedSchema): string {
  // Use schema.module if available, otherwise derive from schema path or use empty string
  // For now, we'll use a simple heuristic - can be enhanced later
  if ((schema as any).module) {
    return (schema as any).module;
  }
  // Default: no module (files go directly in Requests folder)
  return '';
}

/**
 * Generate validation rules for a property (Store - required by default).
 */
function generateStoreRules(
  propName: string,
  propDef: PropertyDefinition,
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): string[] {
  const rules: string[] = [];
  const snakeName = toSnakeCase(propName);
  const prop = propDef as any;
  const tableName = schema.options?.tableName ?? pluralize(toSnakeCase(schema.name));

  // Check if nullable
  const isNullable = prop.nullable === true;

  // Required rule (unless nullable)
  if (!isNullable) {
    rules.push("'required'");
  } else {
    rules.push("'nullable'");
  }

  // Type-specific rules
  switch (propDef.type) {
    case 'String':
    case 'Email':
    case 'Password':
      rules.push("'string'");
      const length = prop.length ?? 255;
      rules.push(`'max:${length}'`);
      if (propDef.type === 'Email') {
        rules.push("'email'");
      }
      break;

    case 'Text':
    case 'MediumText':
    case 'LongText':
      rules.push("'string'");
      break;

    case 'TinyInt':
    case 'Int':
    case 'BigInt':
      rules.push("'integer'");
      if (prop.min !== undefined) {
        rules.push(`'min:${prop.min}'`);
      }
      if (prop.max !== undefined) {
        rules.push(`'max:${prop.max}'`);
      }
      break;

    case 'Float':
    case 'Decimal':
      rules.push("'numeric'");
      if (prop.min !== undefined) {
        rules.push(`'min:${prop.min}'`);
      }
      if (prop.max !== undefined) {
        rules.push(`'max:${prop.max}'`);
      }
      break;

    case 'Boolean':
      rules.push("'boolean'");
      break;

    case 'Date':
      rules.push("'date'");
      break;

    case 'DateTime':
    case 'Timestamp':
      rules.push("'date'");
      break;

    case 'Json':
      rules.push("'array'");
      break;

    case 'Enum':
    case 'EnumRef':
      rules.push("'string'");
      if (prop.enum && Array.isArray(prop.enum)) {
        const values = prop.enum.map((v: string) => `'${v}'`).join(', ');
        rules.push(`Rule::in([${values}])`);
      }
      break;

    case 'Association':
      const assoc = propDef as AssociationDefinition;
      if (assoc.relation === 'ManyToOne' || assoc.relation === 'OneToOne') {
        if (assoc.target) {
          const targetSchema = schemas[assoc.target];
          const targetTable = targetSchema?.options?.tableName ?? pluralize(toSnakeCase(assoc.target));
          rules.push("'integer'");
          rules.push(`'exists:${targetTable},id'`);
        }
      }
      break;

    default:
      // Handle custom types (non-compound)
      const customType = options.customTypes.get(propDef.type);
      if (customType && !customType.compound) {
        // Japanese custom types
        if (propDef.type === 'JapanesePhone') {
          rules.push("'string'");
          rules.push("'max:15'");
          // Japanese phone format: 090-1234-5678 or 03-1234-5678
          rules.push("'regex:/^\\d{2,4}-\\d{2,4}-\\d{4}$/'");
        } else if (propDef.type === 'JapanesePostalCode') {
          rules.push("'string'");
          rules.push("'max:8'");
          // Postal code format: 123-4567
          rules.push("'regex:/^\\d{3}-\\d{4}$/'");
        } else {
          // Default: use SQL type info from custom type
          const sqlType = customType.sql?.sqlType ?? 'VARCHAR';
          const sqlLength = customType.sql?.length ?? 255;
          if (sqlType === 'VARCHAR' || sqlType === 'TEXT') {
            rules.push("'string'");
            if (sqlType === 'VARCHAR') {
              rules.push(`'max:${sqlLength}'`);
            }
          } else if (sqlType === 'INT' || sqlType === 'TINYINT' || sqlType === 'BIGINT') {
            rules.push("'integer'");
          } else if (sqlType === 'DECIMAL' || sqlType === 'FLOAT') {
            rules.push("'numeric'");
          }
        }
      }
      break;
  }

  // Unique constraint
  if (prop.unique === true) {
    rules.push(`'unique:${tableName}'`);
  }

  return rules;
}

/**
 * Generate validation rules for a property (Update - sometimes by default).
 */
function generateUpdateRules(
  propName: string,
  propDef: PropertyDefinition,
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): string[] {
  const rules: string[] = [];
  const snakeName = toSnakeCase(propName);
  const prop = propDef as any;
  const tableName = schema.options?.tableName ?? pluralize(toSnakeCase(schema.name));
  const modelVar = toSnakeCase(schema.name);

  // Use 'sometimes' for partial updates
  rules.push("'sometimes'");

  // Type-specific rules (same as store, but without required)
  switch (propDef.type) {
    case 'String':
    case 'Email':
    case 'Password':
      rules.push("'string'");
      const length = prop.length ?? 255;
      rules.push(`'max:${length}'`);
      if (propDef.type === 'Email') {
        rules.push("'email'");
      }
      break;

    case 'Text':
    case 'MediumText':
    case 'LongText':
      rules.push("'string'");
      break;

    case 'TinyInt':
    case 'Int':
    case 'BigInt':
      rules.push("'integer'");
      if (prop.min !== undefined) {
        rules.push(`'min:${prop.min}'`);
      }
      if (prop.max !== undefined) {
        rules.push(`'max:${prop.max}'`);
      }
      break;

    case 'Float':
    case 'Decimal':
      rules.push("'numeric'");
      if (prop.min !== undefined) {
        rules.push(`'min:${prop.min}'`);
      }
      if (prop.max !== undefined) {
        rules.push(`'max:${prop.max}'`);
      }
      break;

    case 'Boolean':
      rules.push("'boolean'");
      break;

    case 'Date':
      rules.push("'date'");
      break;

    case 'DateTime':
    case 'Timestamp':
      rules.push("'date'");
      break;

    case 'Json':
      rules.push("'array'");
      break;

    case 'Enum':
    case 'EnumRef':
      rules.push("'string'");
      if (prop.enum && Array.isArray(prop.enum)) {
        const values = prop.enum.map((v: string) => `'${v}'`).join(', ');
        rules.push(`Rule::in([${values}])`);
      }
      break;

    case 'Association':
      const assoc = propDef as AssociationDefinition;
      if (assoc.relation === 'ManyToOne' || assoc.relation === 'OneToOne') {
        if (assoc.target) {
          const targetSchema = schemas[assoc.target];
          const targetTable = targetSchema?.options?.tableName ?? pluralize(toSnakeCase(assoc.target));
          rules.push("'integer'");
          rules.push(`'exists:${targetTable},id'`);
        }
      }
      break;

    default:
      // Handle custom types (non-compound)
      const customType = options.customTypes.get(propDef.type);
      if (customType && !customType.compound) {
        // Japanese custom types
        if (propDef.type === 'JapanesePhone') {
          rules.push("'string'");
          rules.push("'max:15'");
          // Japanese phone format: 090-1234-5678 or 03-1234-5678
          rules.push("'regex:/^\\d{2,4}-\\d{2,4}-\\d{4}$/'");
        } else if (propDef.type === 'JapanesePostalCode') {
          rules.push("'string'");
          rules.push("'max:8'");
          // Postal code format: 123-4567
          rules.push("'regex:/^\\d{3}-\\d{4}$/'");
        } else {
          // Default: use SQL type info from custom type
          const sqlType = customType.sql?.sqlType ?? 'VARCHAR';
          const sqlLength = customType.sql?.length ?? 255;
          if (sqlType === 'VARCHAR' || sqlType === 'TEXT') {
            rules.push("'string'");
            if (sqlType === 'VARCHAR') {
              rules.push(`'max:${sqlLength}'`);
            }
          } else if (sqlType === 'INT' || sqlType === 'TINYINT' || sqlType === 'BIGINT') {
            rules.push("'integer'");
          } else if (sqlType === 'DECIMAL' || sqlType === 'FLOAT') {
            rules.push("'numeric'");
          }
        }
      }
      break;
  }

  // Unique constraint with ignore for updates
  if (prop.unique === true) {
    rules.push(`Rule::unique('${tableName}')->ignore($this->route('${modelVar}'))`);
  }

  return rules;
}

/**
 * Get validation rules for a specific compound field type.
 */
function getCompoundFieldRules(
  typeName: string,
  suffix: string,
  field: any,
  fieldOverride: any
): string[] {
  const rules: string[] = [];
  const sql = field.sql;
  const length = fieldOverride?.length ?? sql?.length ?? 255;

  // Handle different compound types with specific validation
  switch (typeName) {
    case 'JapaneseName':
      rules.push("'string'");
      rules.push(`'max:${length}'`);
      // Kana fields could have katakana validation
      if (suffix === 'KanaLastname' || suffix === 'KanaFirstname') {
        // Katakana regex: only katakana and common punctuation
        rules.push("'regex:/^[\\x{30A0}-\\x{30FF}\\x{3000}-\\x{303F}\\x{FF00}-\\x{FF9F}\\s]+$/u'");
      }
      break;

    case 'JapaneseAddress':
      if (suffix === 'PostalCode') {
        rules.push("'string'");
        rules.push("'max:8'");
        // Postal code format: 123-4567
        rules.push("'regex:/^\\d{3}-\\d{4}$/'");
      } else if (suffix === 'PrefectureId') {
        rules.push("'integer'");
        rules.push("'between:1,47'");
      } else {
        // Address1, Address2, Address3
        rules.push("'string'");
        rules.push(`'max:${length}'`);
      }
      break;

    case 'JapaneseBankAccount':
      if (suffix === 'BankCode') {
        rules.push("'string'");
        rules.push("'size:4'");
        rules.push("'regex:/^\\d{4}$/'");
      } else if (suffix === 'BranchCode') {
        rules.push("'string'");
        rules.push("'size:3'");
        rules.push("'regex:/^\\d{3}$/'");
      } else if (suffix === 'AccountType') {
        rules.push("'string'");
        rules.push("Rule::in(['1', '2', '4'])"); // 普通/当座/貯蓄
      } else if (suffix === 'AccountNumber') {
        rules.push("'string'");
        rules.push("'max:7'");
        rules.push("'regex:/^\\d{1,7}$/'");
      } else if (suffix === 'AccountHolder') {
        rules.push("'string'");
        rules.push(`'max:${length}'`);
        // Katakana validation for account holder name
        rules.push("'regex:/^[\\x{30A0}-\\x{30FF}\\x{3000}-\\x{303F}\\x{FF00}-\\x{FF9F}\\s]+$/u'");
      }
      break;

    default:
      // Default handling for unknown compound types
      if (sql?.sqlType === 'TINYINT' || sql?.sqlType === 'INT' || sql?.sqlType === 'BIGINT') {
        rules.push("'integer'");
        if (sql?.unsigned) {
          rules.push("'min:0'");
        }
      } else {
        rules.push("'string'");
        rules.push(`'max:${length}'`);
      }
      break;
  }

  return rules;
}

/**
 * Expand compound type fields.
 */
function expandCompoundTypeFields(
  propName: string,
  propDef: PropertyDefinition,
  options: ResolvedOptions
): { fieldName: string; rules: string[]; needsRuleImport: boolean }[] {
  const typeDef = options.customTypes.get(propDef.type);
  if (!typeDef || !typeDef.compound || !typeDef.expand) {
    return [];
  }

  const snakeName = toSnakeCase(propName);
  const prop = propDef as any;
  const isNullable = prop.nullable === true;
  const fields: { fieldName: string; rules: string[]; needsRuleImport: boolean }[] = [];

  for (const field of typeDef.expand) {
    const suffixSnake = toSnakeCase(field.suffix);
    const fieldName = `${snakeName}_${suffixSnake}`;
    const fieldOverride = prop.fields?.[field.suffix];

    // Field-level nullable can override property-level
    // Also check if the field itself is defined as nullable in the type definition
    const fieldDefNullable = (field as any).sql?.nullable ?? false;
    const fieldNullable = fieldOverride?.nullable ?? fieldDefNullable ?? isNullable;

    const rules: string[] = [];
    if (!fieldNullable) {
      rules.push("'required'");
    } else {
      rules.push("'nullable'");
    }

    // Get type-specific validation rules
    const typeRules = getCompoundFieldRules(propDef.type, field.suffix, field, fieldOverride);
    rules.push(...typeRules);

    const needsRuleImport = rules.some(r => r.includes('Rule::'));
    fields.push({ fieldName, rules, needsRuleImport });
  }

  return fields;
}

/**
 * Generate Store Request Base class.
 */
function generateStoreRequestBase(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): GeneratedRequest {
  const className = toPascalCase(schema.name);
  const module = getModuleName(schema);
  const namespaceModule = module ? `\\${module}` : '';
  const namespace = `${options.baseRequestNamespace}${namespaceModule}`;

  const properties = schema.properties ?? {};
  const rulesLines: string[] = [];
  const attributeLines: string[] = [];
  const fieldList: string[] = [];
  let needsRuleImport = false;

  for (const [propName, propDef] of Object.entries(properties)) {
    const snakeName = toSnakeCase(propName);

    // Skip system fields
    if (SKIP_FIELDS.has(snakeName)) continue;

    // Skip association relations that don't have FK (OneToMany, ManyToMany, etc.)
    if (propDef.type === 'Association') {
      const assoc = propDef as AssociationDefinition;
      if (assoc.relation !== 'ManyToOne' && assoc.relation !== 'OneToOne') {
        continue;
      }
      // For ManyToOne/OneToOne, use the FK field name
      const fkName = `${snakeName}_id`;
      const rules = generateStoreRules(propName, propDef, schema, schemas, options);
      if (rules.some(r => r.includes('Rule::'))) needsRuleImport = true;
      rulesLines.push(`            '${fkName}' => [${rules.join(', ')}],`);
      fieldList.push(fkName);

      // Attribute for FK
      const displayName = getDisplayName((propDef as any).displayName, options.locale, propName);
      attributeLines.push(`            '${fkName}' => '${escapePhpString(displayName)}',`);
      continue;
    }

    // Check for compound types
    const expandedFields = expandCompoundTypeFields(propName, propDef, options);
    if (expandedFields.length > 0) {
      for (const field of expandedFields) {
        if (field.needsRuleImport) needsRuleImport = true;
        rulesLines.push(`            '${field.fieldName}' => [${field.rules.join(', ')}],`);
        fieldList.push(field.fieldName);
        attributeLines.push(`            '${field.fieldName}' => '${escapePhpString(field.fieldName)}',`);
      }
      continue;
    }

    // Regular field
    const rules = generateStoreRules(propName, propDef, schema, schemas, options);
    if (rules.some(r => r.includes('Rule::'))) needsRuleImport = true;
    rulesLines.push(`            '${snakeName}' => [${rules.join(', ')}],`);
    fieldList.push(snakeName);

    // Attribute
    const displayName = getDisplayName((propDef as any).displayName, options.locale, propName);
    attributeLines.push(`            '${snakeName}' => '${escapePhpString(displayName)}',`);
  }

  const ruleImport = needsRuleImport ? '\nuse Illuminate\\Validation\\Rule;' : '';

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

use Illuminate\\Foundation\\Http\\FormRequest;${ruleImport}

abstract class ${className}StoreRequestBase extends FormRequest
{
    /**
     * Validation rules generated from Omnify schema.
     *
     * Generated fields: ${fieldList.join(', ')}
     *
     * @return array<string, array<int, mixed>>
     */
    protected function schemaRules(): array
    {
        return [
${rulesLines.join('\n')}
        ];
    }

    /**
     * Get custom attributes for validator errors.
     *
     * @return array<string, string>
     */
    protected function schemaAttributes(): array
    {
        return [
${attributeLines.join('\n')}
        ];
    }
}
`;

  const modulePath = module ? `/${module}` : '';
  return {
    path: `${options.baseRequestPath}${modulePath}/${className}StoreRequestBase.php`,
    content,
    type: 'store-base',
    overwrite: true,
    schemaName: schema.name,
    module,
  };
}

/**
 * Generate Update Request Base class.
 */
function generateUpdateRequestBase(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): GeneratedRequest {
  const className = toPascalCase(schema.name);
  const module = getModuleName(schema);
  const namespaceModule = module ? `\\${module}` : '';
  const namespace = `${options.baseRequestNamespace}${namespaceModule}`;

  const properties = schema.properties ?? {};
  const rulesLines: string[] = [];
  const attributeLines: string[] = [];
  let needsRuleImport = false;

  for (const [propName, propDef] of Object.entries(properties)) {
    const snakeName = toSnakeCase(propName);

    // Skip system fields
    if (SKIP_FIELDS.has(snakeName)) continue;

    // Skip association relations that don't have FK
    if (propDef.type === 'Association') {
      const assoc = propDef as AssociationDefinition;
      if (assoc.relation !== 'ManyToOne' && assoc.relation !== 'OneToOne') {
        continue;
      }
      const fkName = `${snakeName}_id`;
      const rules = generateUpdateRules(propName, propDef, schema, schemas, options);
      if (rules.some(r => r.includes('Rule::') || r.includes('Rule::'))) needsRuleImport = true;
      rulesLines.push(`            '${fkName}' => [${rules.join(', ')}],`);

      const displayName = getDisplayName((propDef as any).displayName, options.locale, propName);
      attributeLines.push(`            '${fkName}' => '${escapePhpString(displayName)}',`);
      continue;
    }

    // Check for compound types
    const expandedFields = expandCompoundTypeFields(propName, propDef, options);
    if (expandedFields.length > 0) {
      for (const field of expandedFields) {
        if (field.needsRuleImport) needsRuleImport = true;
        // For update, replace 'required' with 'sometimes'
        const updateRules = field.rules.map(r => r === "'required'" ? "'sometimes'" : r);
        rulesLines.push(`            '${field.fieldName}' => [${updateRules.join(', ')}],`);
        attributeLines.push(`            '${field.fieldName}' => '${escapePhpString(field.fieldName)}',`);
      }
      continue;
    }

    // Regular field
    const rules = generateUpdateRules(propName, propDef, schema, schemas, options);
    if (rules.some(r => r.includes('Rule::'))) needsRuleImport = true;
    rulesLines.push(`            '${snakeName}' => [${rules.join(', ')}],`);

    const displayName = getDisplayName((propDef as any).displayName, options.locale, propName);
    attributeLines.push(`            '${snakeName}' => '${escapePhpString(displayName)}',`);
  }

  const ruleImport = needsRuleImport ? '\nuse Illuminate\\Validation\\Rule;' : '';

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

use Illuminate\\Foundation\\Http\\FormRequest;${ruleImport}

abstract class ${className}UpdateRequestBase extends FormRequest
{
    /**
     * Validation rules generated from Omnify schema.
     * All fields use 'sometimes' for partial updates.
     *
     * @return array<string, array<int, mixed>>
     */
    protected function schemaRules(): array
    {
        return [
${rulesLines.join('\n')}
        ];
    }

    /**
     * Get custom attributes for validator errors.
     *
     * @return array<string, string>
     */
    protected function schemaAttributes(): array
    {
        return [
${attributeLines.join('\n')}
        ];
    }
}
`;

  const modulePath = module ? `/${module}` : '';
  return {
    path: `${options.baseRequestPath}${modulePath}/${className}UpdateRequestBase.php`,
    content,
    type: 'update-base',
    overwrite: true,
    schemaName: schema.name,
    module,
  };
}

/**
 * Generate OpenAPI properties for a request based on schema.
 */
function generateRequestOpenApiProperties(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions,
  isStore: boolean
): { properties: RequestOpenApiProperty[]; requiredFields: string[] } {
  const properties: RequestOpenApiProperty[] = [];
  const requiredFields: string[] = [];
  const schemaProps = schema.properties ?? {};

  for (const [propName, propDef] of Object.entries(schemaProps)) {
    const snakeName = toSnakeCase(propName);

    // Skip system fields
    if (SKIP_FIELDS.has(snakeName)) continue;

    // Skip associations that don't have FK
    if (propDef.type === 'Association') {
      const assoc = propDef as AssociationDefinition;
      if (assoc.relation !== 'ManyToOne' && assoc.relation !== 'OneToOne') {
        continue;
      }
      // For FK fields
      const fkName = `${snakeName}_id`;
      const rules = isStore
        ? generateStoreRules(propName, propDef, schema, schemas, options)
        : generateUpdateRules(propName, propDef, schema, schemas, options);
      const openApiType = mapValidationToOpenApiType(rules, fkName);
      const constraints = extractConstraints(rules);
      const example = getExampleValue(fkName, openApiType.type);

      const prop: RequestOpenApiProperty = {
        property: fkName,
        ...openApiType,
        ...constraints,
      };
      if (example !== undefined) prop.example = example;
      properties.push(prop);

      // Required if store and not nullable
      if (isStore && !(propDef as any).nullable) {
        requiredFields.push(fkName);
      }
      continue;
    }

    // Check for compound types
    const expandedFields = expandCompoundTypeFields(propName, propDef, options);
    if (expandedFields.length > 0) {
      for (const field of expandedFields) {
        const openApiType = mapValidationToOpenApiType(field.rules, field.fieldName);
        const constraints = extractConstraints(field.rules);
        const example = getExampleValue(field.fieldName, openApiType.type);

        const prop: RequestOpenApiProperty = {
          property: field.fieldName,
          ...openApiType,
          ...constraints,
        };
        if (example !== undefined) prop.example = example;
        properties.push(prop);

        // Required if store and has 'required' rule
        if (isStore && field.rules.includes("'required'")) {
          requiredFields.push(field.fieldName);
        }
      }
      continue;
    }

    // Regular field
    const rules = isStore
      ? generateStoreRules(propName, propDef, schema, schemas, options)
      : generateUpdateRules(propName, propDef, schema, schemas, options);
    const openApiType = mapValidationToOpenApiType(rules, snakeName);
    const constraints = extractConstraints(rules);
    const example = getExampleValue(snakeName, openApiType.type);

    const prop: RequestOpenApiProperty = {
      property: snakeName,
      ...openApiType,
      ...constraints,
    };
    if (example !== undefined) prop.example = example;
    properties.push(prop);

    // Required if store and has 'required' rule
    if (isStore && rules.includes("'required'")) {
      requiredFields.push(snakeName);
    }
  }

  return { properties, requiredFields };
}

/**
 * Generate Store Request (user-editable).
 */
function generateStoreRequest(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): GeneratedRequest {
  const className = toPascalCase(schema.name);
  const module = getModuleName(schema);
  const namespaceModule = module ? `\\${module}` : '';
  const namespace = `${options.requestNamespace}${namespaceModule}`;
  const baseNamespace = `${options.baseRequestNamespace}${namespaceModule}`;

  // Generate OpenAPI properties
  const { properties, requiredFields } = generateRequestOpenApiProperties(schema, schemas, options, true);
  const propsIndent = '        ';
  const openApiPropsFormatted = properties
    .map(prop => formatRequestOpenApiProperty(prop, propsIndent))
    .join(',\n');

  // Format required array
  const requiredArray = requiredFields.length > 0
    ? `\n    required: [${requiredFields.map(f => `'${f}'`).join(', ')}],`
    : '';

  const content = `<?php

/**
 * ${className} Store Request
 *
 * SAFE TO EDIT - This file is never overwritten by Omnify.
 */

namespace ${namespace};

use OpenApi\\Attributes as OA;
use ${baseNamespace}\\${className}StoreRequestBase;

#[OA\\Schema(
    schema: '${schema.name}StoreRequest',${requiredArray}
    properties: [
${openApiPropsFormatted},
    ]
)]
class ${className}StoreRequest extends ${className}StoreRequestBase
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return array_merge($this->schemaRules(), [
            // Custom/override rules here
        ]);
    }

    /**
     * Get custom attributes for validator errors.
     *
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return array_merge($this->schemaAttributes(), [
            // Custom attributes here
        ]);
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            // Custom messages here
        ];
    }
}
`;

  const modulePath = module ? `/${module}` : '';
  return {
    path: `${options.requestPath}${modulePath}/${className}StoreRequest.php`,
    content,
    type: 'store',
    overwrite: false,
    schemaName: schema.name,
    module,
  };
}

/**
 * Generate Update Request (user-editable).
 */
function generateUpdateRequest(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): GeneratedRequest {
  const className = toPascalCase(schema.name);
  const module = getModuleName(schema);
  const namespaceModule = module ? `\\${module}` : '';
  const namespace = `${options.requestNamespace}${namespaceModule}`;
  const baseNamespace = `${options.baseRequestNamespace}${namespaceModule}`;

  // Generate OpenAPI properties (no required array for update - partial updates allowed)
  const { properties } = generateRequestOpenApiProperties(schema, schemas, options, false);
  const propsIndent = '        ';
  const openApiPropsFormatted = properties
    .map(prop => formatRequestOpenApiProperty(prop, propsIndent))
    .join(',\n');

  const content = `<?php

/**
 * ${className} Update Request
 *
 * SAFE TO EDIT - This file is never overwritten by Omnify.
 */

namespace ${namespace};

use OpenApi\\Attributes as OA;
use ${baseNamespace}\\${className}UpdateRequestBase;

#[OA\\Schema(
    schema: '${schema.name}UpdateRequest',
    properties: [
${openApiPropsFormatted},
    ]
)]
class ${className}UpdateRequest extends ${className}UpdateRequestBase
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return array_merge($this->schemaRules(), [
            // Custom/override rules here
        ]);
    }

    /**
     * Get custom attributes for validator errors.
     *
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return array_merge($this->schemaAttributes(), [
            // Custom attributes here
        ]);
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            // Custom messages here
        ];
    }
}
`;

  const modulePath = module ? `/${module}` : '';
  return {
    path: `${options.requestPath}${modulePath}/${className}UpdateRequest.php`,
    content,
    type: 'update',
    overwrite: false,
    schemaName: schema.name,
    module,
  };
}

/**
 * Generate all FormRequest classes for the given schemas.
 */
export function generateRequests(
  schemas: SchemaCollection,
  options?: RequestGeneratorOptions
): GeneratedRequest[] {
  const resolved = resolveOptions(options);
  const requests: GeneratedRequest[] = [];

  for (const schema of Object.values(schemas)) {
    // Skip enums
    if (schema.kind === 'enum') continue;

    // Skip hidden schemas
    if (schema.options?.hidden === true) continue;

    // Generate base requests (always overwritten)
    requests.push(generateStoreRequestBase(schema, schemas, resolved));
    requests.push(generateUpdateRequestBase(schema, schemas, resolved));

    // Generate user requests (created once)
    requests.push(generateStoreRequest(schema, schemas, resolved));
    requests.push(generateUpdateRequest(schema, schemas, resolved));
  }

  return requests;
}

/**
 * Get the output path for a request.
 */
export function getRequestPath(request: GeneratedRequest): string {
  return request.path;
}
