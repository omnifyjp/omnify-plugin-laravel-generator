/**
 * Utility functions for Laravel generator.
 */

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
 * Simple pluralization (English).
 */
export function pluralize(word: string): string {
  if (word.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].some(v => word.endsWith(v))) {
    return word.slice(0, -1) + 'ies';
  }
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') ||
      word.endsWith('ch') || word.endsWith('sh')) {
    return word + 'es';
  }
  return word + 's';
}
