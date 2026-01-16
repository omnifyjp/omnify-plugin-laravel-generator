/**
 * @famgia/omnify-laravel - TypeScript Module
 *
 * TypeScript code generation exports.
 */

export type {
  TypeScriptFile,
  TypeScriptOptions,
  TSProperty,
  TSInterface,
  TSEnum,
  TSEnumValue,
  TSTypeAlias,
} from './types.js';

export {
  toPropertyName,
  toInterfaceName,
  getPropertyType,
  propertyToTSProperty,
  schemaToInterface,
  formatProperty,
  formatInterface,
  generateInterfaces,
} from './interface-generator.js';

export {
  toEnumMemberName,
  toEnumName,
  schemaToEnum,
  generateEnums,
  formatEnum,
  enumToUnionType,
  formatTypeAlias,
  extractInlineEnums,
} from './enum-generator.js';

export {
  generateTypeScriptFile,
  generateTypeScriptFiles,
  generateTypeScript,
  getTypeScriptPath,
} from './generator.js';
