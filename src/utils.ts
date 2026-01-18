/**
 * Utility functions for Laravel generator.
 */

import pluralizeLib from 'pluralize';

/**
 * Convert a string to snake_case.
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase();
}

/**
 * Convert a string to PascalCase.
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

/**
 * Convert a string to camelCase.
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Pluralize an English word.
 * Uses the battle-tested 'pluralize' library (4.4M+ weekly downloads).
 * 
 * Note: Database table/column names are always in English by Laravel convention,
 * regardless of the application's display language (Japanese, Vietnamese, etc.).
 * 
 * @example
 * pluralize('user') // 'users'
 * pluralize('category') // 'categories'
 * pluralize('branch') // 'branches'
 * pluralize('child') // 'children'
 * pluralize('person') // 'people'
 */
export function pluralize(word: string): string {
  return pluralizeLib.plural(word);
}

/**
 * Singularize an English word.
 * Uses the battle-tested 'pluralize' library (4.4M+ weekly downloads).
 * 
 * Handles:
 * - Regular plurals: users → user, posts → post
 * - Words ending in -ies: categories → category
 * - Words ending in -ches/-shes/-xes: branches → branch, boxes → box
 * - Irregular words: children → child, people → person, mice → mouse
 * - Uncountable words: equipment, information (returned as-is)
 * 
 * Note: Database table/column names are always in English by Laravel convention,
 * regardless of the application's display language (Japanese, Vietnamese, etc.).
 * 
 * @example
 * singularize('users') // 'user'
 * singularize('categories') // 'category'
 * singularize('branches') // 'branch'
 * singularize('children') // 'child'
 * singularize('people') // 'person'
 */
export function singularize(word: string): string {
  return pluralizeLib.singular(word);
}
