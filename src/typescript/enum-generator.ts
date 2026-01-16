/**
 * @famgia/omnify-laravel - TypeScript Enum Generator
 *
 * Generates TypeScript enums from schema enum definitions.
 */

import type { LoadedSchema, SchemaCollection } from '@famgia/omnify-types';
import { resolveLocalizedString } from '@famgia/omnify-types';
import type { TSEnum, TSEnumValue, TSTypeAlias } from './types.js';

/**
 * Converts enum value to valid TypeScript enum member name.
 */
export function toEnumMemberName(value: string): string {
  // Convert to PascalCase and remove invalid characters
  return value
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Converts schema name to TypeScript enum name.
 */
export function toEnumName(schemaName: string): string {
  return schemaName;
}

/**
 * Generates TypeScript enum from schema enum.
 */
export function schemaToEnum(schema: LoadedSchema): TSEnum | null {
  if (schema.kind !== 'enum' || !schema.values) {
    return null;
  }

  const values: TSEnumValue[] = schema.values.map(value => ({
    name: toEnumMemberName(value),
    value,
  }));

  return {
    name: toEnumName(schema.name),
    values,
    comment: resolveLocalizedString(schema.displayName) ?? schema.name,
  };
}

/**
 * Generates enums for all enum schemas.
 */
export function generateEnums(schemas: SchemaCollection): TSEnum[] {
  const enums: TSEnum[] = [];

  for (const schema of Object.values(schemas)) {
    if (schema.kind === 'enum') {
      const enumDef = schemaToEnum(schema);
      if (enumDef) {
        enums.push(enumDef);
      }
    }
  }

  return enums;
}

/**
 * Formats a TypeScript enum.
 */
export function formatEnum(enumDef: TSEnum): string {
  const comment = enumDef.comment ? `/**\n * ${enumDef.comment}\n */\n` : '';
  const values = enumDef.values
    .map(v => `  ${v.name} = '${v.value}',`)
    .join('\n');

  return `${comment}export enum ${enumDef.name} {\n${values}\n}`;
}

/**
 * Generates a union type alias as an alternative to enum.
 */
export function enumToUnionType(enumDef: TSEnum): TSTypeAlias {
  const type = enumDef.values
    .map(v => `'${v.value}'`)
    .join(' | ');

  return {
    name: enumDef.name,
    type,
    comment: enumDef.comment,
  };
}

/**
 * Formats a TypeScript type alias.
 */
export function formatTypeAlias(alias: TSTypeAlias): string {
  const comment = alias.comment ? `/**\n * ${alias.comment}\n */\n` : '';
  return `${comment}export type ${alias.name} = ${alias.type};`;
}

/**
 * Extracts inline enums from properties for type generation.
 */
export function extractInlineEnums(schemas: SchemaCollection): TSTypeAlias[] {
  const typeAliases: TSTypeAlias[] = [];

  for (const schema of Object.values(schemas)) {
    if (schema.kind === 'enum' || !schema.properties) {
      continue;
    }

    for (const [propName, property] of Object.entries(schema.properties)) {
      if (property.type === 'Enum') {
        const enumProp = property as { enum?: readonly string[]; displayName?: string };

        // Only handle inline array enums (not references to named enums)
        if (Array.isArray(enumProp.enum) && enumProp.enum.length > 0) {
          const typeName = `${schema.name}${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
          typeAliases.push({
            name: typeName,
            type: enumProp.enum.map(v => `'${v}'`).join(' | '),
            comment: enumProp.displayName ?? `${schema.name} ${propName} enum`,
          });
        }
      }

      if (property.type === 'Select') {
        const selectProp = property as { options?: readonly string[]; displayName?: string };

        if (selectProp.options && selectProp.options.length > 0) {
          const typeName = `${schema.name}${propName.charAt(0).toUpperCase() + propName.slice(1)}`;
          typeAliases.push({
            name: typeName,
            type: selectProp.options.map(v => `'${v}'`).join(' | '),
            comment: selectProp.displayName ?? `${schema.name} ${propName} options`,
          });
        }
      }
    }
  }

  return typeAliases;
}
