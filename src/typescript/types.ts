/**
 * @famgia/omnify-laravel - TypeScript Types
 *
 * Types for TypeScript code generation.
 */

/**
 * Generated TypeScript file.
 */
export interface TypeScriptFile {
  /** File name */
  readonly fileName: string;
  /** Full file content */
  readonly content: string;
  /** Types defined in this file */
  readonly types: readonly string[];
}

/**
 * TypeScript generation options.
 */
export interface TypeScriptOptions {
  /** Output directory for TypeScript files */
  readonly outputDir?: string | undefined;
  /** Whether to generate a single file or multiple files */
  readonly singleFile?: boolean | undefined;
  /** File name for single file output */
  readonly fileName?: string | undefined;
  /** Whether to export as default */
  readonly exportDefault?: boolean | undefined;
  /** Whether to include readonly modifiers */
  readonly readonly?: boolean | undefined;
  /** Whether to use strict null checks compatible types */
  readonly strictNullChecks?: boolean | undefined;
}

/**
 * TypeScript property definition.
 */
export interface TSProperty {
  /** Property name */
  readonly name: string;
  /** TypeScript type */
  readonly type: string;
  /** Whether the property is optional */
  readonly optional: boolean;
  /** Whether the property is readonly */
  readonly readonly: boolean;
  /** JSDoc comment */
  readonly comment?: string | undefined;
}

/**
 * TypeScript interface definition.
 */
export interface TSInterface {
  /** Interface name */
  readonly name: string;
  /** Properties */
  readonly properties: readonly TSProperty[];
  /** Extended interfaces */
  readonly extends?: readonly string[] | undefined;
  /** JSDoc comment */
  readonly comment?: string | undefined;
}

/**
 * TypeScript enum definition.
 */
export interface TSEnum {
  /** Enum name */
  readonly name: string;
  /** Enum values */
  readonly values: readonly TSEnumValue[];
  /** JSDoc comment */
  readonly comment?: string | undefined;
}

/**
 * TypeScript enum value.
 */
export interface TSEnumValue {
  /** Value name */
  readonly name: string;
  /** Value (string or number) */
  readonly value: string | number;
}

/**
 * TypeScript type alias definition.
 */
export interface TSTypeAlias {
  /** Type name */
  readonly name: string;
  /** Type definition */
  readonly type: string;
  /** JSDoc comment */
  readonly comment?: string | undefined;
}
