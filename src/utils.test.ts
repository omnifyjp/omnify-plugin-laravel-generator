/**
 * Tests for utility functions.
 * 
 * Note: pluralize/singularize use the 'pluralize' npm package (4.4M+ weekly downloads)
 * which handles English irregular words correctly. Database table/column names are
 * always in English by Laravel convention, regardless of display language.
 */

import { describe, it, expect } from 'vitest';
import { toSnakeCase, toPascalCase, toCamelCase, pluralize, singularize } from './utils.js';

describe('toSnakeCase', () => {
  it('converts PascalCase to snake_case', () => {
    expect(toSnakeCase('User')).toBe('user');
    expect(toSnakeCase('BlogPost')).toBe('blog_post');
    expect(toSnakeCase('UserRole')).toBe('user_role');
  });
});

describe('toPascalCase', () => {
  it('converts snake_case to PascalCase', () => {
    expect(toPascalCase('user')).toBe('User');
    expect(toPascalCase('blog_post')).toBe('BlogPost');
    expect(toPascalCase('user_role')).toBe('UserRole');
  });
});

describe('toCamelCase', () => {
  it('converts snake_case to camelCase', () => {
    expect(toCamelCase('user')).toBe('user');
    expect(toCamelCase('blog_post')).toBe('blogPost');
    expect(toCamelCase('user_role')).toBe('userRole');
  });
});

describe('pluralize', () => {
  it('handles regular nouns', () => {
    expect(pluralize('user')).toBe('users');
    expect(pluralize('post')).toBe('posts');
    expect(pluralize('product')).toBe('products');
  });

  it('handles words ending in y', () => {
    expect(pluralize('category')).toBe('categories');
    expect(pluralize('company')).toBe('companies');
    expect(pluralize('country')).toBe('countries');
  });

  it('handles words ending in y with vowel before', () => {
    expect(pluralize('day')).toBe('days');
    expect(pluralize('key')).toBe('keys');
    expect(pluralize('array')).toBe('arrays');
  });

  it('handles words ending in ch, sh, x, z, s', () => {
    expect(pluralize('branch')).toBe('branches');
    expect(pluralize('batch')).toBe('batches');
    expect(pluralize('match')).toBe('matches');
    expect(pluralize('bush')).toBe('bushes');
    expect(pluralize('box')).toBe('boxes');
    expect(pluralize('quiz')).toBe('quizzes');
    expect(pluralize('status')).toBe('statuses');
  });

  it('handles irregular words', () => {
    expect(pluralize('child')).toBe('children');
    expect(pluralize('person')).toBe('people');
    expect(pluralize('mouse')).toBe('mice');
    expect(pluralize('foot')).toBe('feet');
    expect(pluralize('tooth')).toBe('teeth');
    expect(pluralize('goose')).toBe('geese');
    expect(pluralize('man')).toBe('men');
    expect(pluralize('woman')).toBe('women');
  });

  it('handles uncountable words', () => {
    expect(pluralize('equipment')).toBe('equipment');
    expect(pluralize('information')).toBe('information');
    expect(pluralize('news')).toBe('news');
    expect(pluralize('species')).toBe('species');
  });
});

describe('singularize', () => {
  it('handles regular plural nouns', () => {
    expect(singularize('users')).toBe('user');
    expect(singularize('posts')).toBe('post');
    expect(singularize('products')).toBe('product');
    expect(singularize('organizations')).toBe('organization');
  });

  it('handles words ending in ies → y', () => {
    expect(singularize('categories')).toBe('category');
    expect(singularize('companies')).toBe('company');
    expect(singularize('countries')).toBe('country');
  });

  it('handles words ending in ches → ch (THE BUG FIX)', () => {
    // This was the original bug: 'branches' → 'branche' instead of 'branch'
    expect(singularize('branches')).toBe('branch');
    expect(singularize('batches')).toBe('batch');
    expect(singularize('matches')).toBe('match');
    expect(singularize('patches')).toBe('patch');
    expect(singularize('searches')).toBe('search');
  });

  it('handles words ending in shes → sh', () => {
    expect(singularize('bushes')).toBe('bush');
    expect(singularize('dishes')).toBe('dish');
    expect(singularize('wishes')).toBe('wish');
  });

  it('handles words ending in xes → x', () => {
    expect(singularize('boxes')).toBe('box');
    expect(singularize('taxes')).toBe('tax');
    expect(singularize('indexes')).toBe('index');
  });

  it('handles words ending in ses → s', () => {
    expect(singularize('statuses')).toBe('status');
    expect(singularize('buses')).toBe('bus');
    expect(singularize('classes')).toBe('class');
  });

  it('handles irregular words', () => {
    expect(singularize('children')).toBe('child');
    expect(singularize('people')).toBe('person');
    expect(singularize('mice')).toBe('mouse');
    expect(singularize('feet')).toBe('foot');
    expect(singularize('teeth')).toBe('tooth');
    expect(singularize('geese')).toBe('goose');
    expect(singularize('men')).toBe('man');
    expect(singularize('women')).toBe('woman');
  });

  it('handles uncountable words', () => {
    expect(singularize('equipment')).toBe('equipment');
    expect(singularize('information')).toBe('information');
    expect(singularize('news')).toBe('news');
    expect(singularize('species')).toBe('species');
  });

  it('returns singular words unchanged', () => {
    expect(singularize('user')).toBe('user');
    expect(singularize('branch')).toBe('branch');
    expect(singularize('category')).toBe('category');
    expect(singularize('child')).toBe('child');
  });

  it('is inverse of pluralize for common words', () => {
    const words = [
      'user', 'post', 'category', 'branch', 'box', 'status', 'company',
      'child', 'person', 'mouse', 'product', 'order', 'item'
    ];
    for (const word of words) {
      expect(singularize(pluralize(word))).toBe(word);
    }
  });
});
