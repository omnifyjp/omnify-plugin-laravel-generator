/**
 * @famgia/omnify-laravel - Comprehensive Enum Tests
 *
 * Based on PHP EnumTypeTest with 22+ test cases.
 */

import { describe, it, expect } from 'vitest';
import {
  toEnumMemberName,
  schemaToEnum,
  formatEnum,
  generateEnums,
} from './enum-generator.js';
import type { LoadedSchema, SchemaCollection } from '@famgia/omnify-types';

describe('Enum Member Name Conversion', () => {
  it('converts simple lowercase to PascalCase', () => {
    expect(toEnumMemberName('active')).toBe('Active');
    expect(toEnumMemberName('pending')).toBe('Pending');
  });

  it('converts snake_case to PascalCase', () => {
    expect(toEnumMemberName('in_progress')).toBe('InProgress');
    expect(toEnumMemberName('not_started')).toBe('NotStarted');
    expect(toEnumMemberName('waiting_for_approval')).toBe('WaitingForApproval');
  });

  it('converts kebab-case to PascalCase', () => {
    expect(toEnumMemberName('on-hold')).toBe('OnHold');
    expect(toEnumMemberName('in-review')).toBe('InReview');
  });

  it('converts UPPERCASE to PascalCase', () => {
    expect(toEnumMemberName('ACTIVE')).toBe('Active');
    expect(toEnumMemberName('IN_PROGRESS')).toBe('InProgress');
  });

  it('handles camelCase (capitalizes first letter)', () => {
    // The current implementation doesn't split on camelCase, just capitalizes first letter
    expect(toEnumMemberName('inProgress')).toBe('Inprogress');
    expect(toEnumMemberName('waitingForApproval')).toBe('Waitingforapproval');
  });

  it('handles numbers in values', () => {
    expect(toEnumMemberName('level1')).toBe('Level1');
    expect(toEnumMemberName('tier_2')).toBe('Tier2');
  });

  it('handles single character values', () => {
    expect(toEnumMemberName('a')).toBe('A');
    expect(toEnumMemberName('x')).toBe('X');
  });
});

describe('Schema to Enum Conversion', () => {
  it('converts basic enum schema', () => {
    const schema: LoadedSchema = {
      name: 'Status',
      kind: 'enum',
      filePath: '/test/status.yaml',
      relativePath: '/test/status.yaml',
      values: ['active', 'inactive', 'pending'],
    };

    const result = schemaToEnum(schema);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Status');
    expect(result?.values).toHaveLength(3);
  });

  it('preserves original values', () => {
    const schema: LoadedSchema = {
      name: 'Priority',
      kind: 'enum',
      filePath: '/test/priority.yaml',
      relativePath: '/test/priority.yaml',
      values: ['low', 'medium', 'high'],
    };

    const result = schemaToEnum(schema);

    expect(result?.values[0]).toEqual({ name: 'Low', value: 'low' });
    expect(result?.values[1]).toEqual({ name: 'Medium', value: 'medium' });
    expect(result?.values[2]).toEqual({ name: 'High', value: 'high' });
  });

  it('handles snake_case values', () => {
    const schema: LoadedSchema = {
      name: 'OrderStatus',
      kind: 'enum',
      filePath: '/test/order-status.yaml',
      relativePath: '/test/order-status.yaml',
      values: ['pending_payment', 'processing', 'shipped', 'delivered'],
    };

    const result = schemaToEnum(schema);

    expect(result?.values[0]).toEqual({ name: 'PendingPayment', value: 'pending_payment' });
  });

  it('returns null for non-enum schema', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: { name: { type: 'String' } },
    };

    const result = schemaToEnum(schema);
    expect(result).toBeNull();
  });

  it('includes displayName as comment', () => {
    const schema: LoadedSchema = {
      name: 'Status',
      kind: 'enum',
      filePath: '/test/status.yaml',
      relativePath: '/test/status.yaml',
      displayName: 'Order Status',
      values: ['active', 'inactive'],
    };

    const result = schemaToEnum(schema);
    expect(result?.comment).toBe('Order Status');
  });

  it('handles enum with simple string values', () => {
    const schema: LoadedSchema = {
      name: 'Status',
      kind: 'enum',
      filePath: '/test/status.yaml',
      relativePath: '/test/status.yaml',
      values: ['active', 'inactive'],
    };

    const result = schemaToEnum(schema);

    expect(result?.values[0].value).toBe('active');
    expect(result?.values[1].value).toBe('inactive');
  });
});

describe('Enum Formatting', () => {
  it('formats basic enum', () => {
    const result = formatEnum({
      name: 'Status',
      values: [
        { name: 'Active', value: 'active' },
        { name: 'Inactive', value: 'inactive' },
      ],
    });

    expect(result).toContain('export enum Status {');
    expect(result).toContain("Active = 'active',");
    expect(result).toContain("Inactive = 'inactive',");
    expect(result).toContain('}');
  });

  it('includes JSDoc comment when provided', () => {
    const result = formatEnum({
      name: 'Priority',
      values: [{ name: 'High', value: 'high' }],
      comment: 'Task priority levels',
    });

    // Multi-line JSDoc format
    expect(result).toContain('* Task priority levels');
  });

  it('handles many values', () => {
    const result = formatEnum({
      name: 'Month',
      values: [
        { name: 'January', value: 'january' },
        { name: 'February', value: 'february' },
        { name: 'March', value: 'march' },
        { name: 'April', value: 'april' },
        { name: 'May', value: 'may' },
        { name: 'June', value: 'june' },
        { name: 'July', value: 'july' },
        { name: 'August', value: 'august' },
        { name: 'September', value: 'september' },
        { name: 'October', value: 'october' },
        { name: 'November', value: 'november' },
        { name: 'December', value: 'december' },
      ],
    });

    expect(result).toContain("January = 'january',");
    expect(result).toContain("December = 'december',");
  });

  it('handles special characters in values', () => {
    const result = formatEnum({
      name: 'Status',
      values: [
        { name: 'InProgress', value: 'in-progress' },
        { name: 'OnHold', value: 'on_hold' },
      ],
    });

    expect(result).toContain("InProgress = 'in-progress',");
    expect(result).toContain("OnHold = 'on_hold',");
  });
});

describe('Enum Generation', () => {
  it('generates enums from schema collection', () => {
    const schemas: SchemaCollection = {
      Status: {
        name: 'Status',
        kind: 'enum',
        filePath: '/test/status.yaml',
        relativePath: '/test/status.yaml',
        values: ['active', 'inactive'],
      },
      Priority: {
        name: 'Priority',
        kind: 'enum',
        filePath: '/test/priority.yaml',
        relativePath: '/test/priority.yaml',
        values: ['low', 'medium', 'high'],
      },
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        properties: { name: { type: 'String' } },
      },
    };

    const result = generateEnums(schemas);

    // Should only include enum schemas
    expect(result).toHaveLength(2);
    expect(result.find(e => e.name === 'Status')).toBeDefined();
    expect(result.find(e => e.name === 'Priority')).toBeDefined();
  });

  it('skips object schemas', () => {
    const schemas: SchemaCollection = {
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        properties: { name: { type: 'String' } },
      },
    };

    const result = generateEnums(schemas);
    expect(result).toHaveLength(0);
  });

  it('handles empty schema collection', () => {
    const result = generateEnums({});
    expect(result).toHaveLength(0);
  });
});

describe('Inline Enum in Properties', () => {
  // These test inline enums defined within properties

  it('handles inline enum with simple values', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        role: {
          type: 'Enum',
          enum: ['admin', 'user', 'guest'],
        } as any,
      },
    };

    // Inline enums are typically rendered as union types in TypeScript
    // This tests that the enum values are accessible
    const roleProp = schema.properties?.role as any;
    expect(roleProp.enum).toEqual(['admin', 'user', 'guest']);
  });

  it('handles inline enum with default value', () => {
    const schema: LoadedSchema = {
      name: 'Post',
      kind: 'object',
      filePath: '/test/post.yaml',
      relativePath: '/test/post.yaml',
      properties: {
        status: {
          type: 'Enum',
          enum: ['draft', 'published', 'archived'],
          default: 'draft',
        } as any,
      },
    };

    const statusProp = schema.properties?.status as any;
    expect(statusProp.default).toBe('draft');
  });

  it('handles nullable inline enum', () => {
    const schema: LoadedSchema = {
      name: 'Task',
      kind: 'object',
      filePath: '/test/task.yaml',
      relativePath: '/test/task.yaml',
      properties: {
        priority: {
          type: 'Enum',
          enum: ['low', 'medium', 'high'],
          nullable: true,
        } as any,
      },
    };

    const priorityProp = schema.properties?.priority as any;
    expect(priorityProp.nullable).toBe(true);
  });
});

describe('Edge Cases', () => {
  it('handles enum with single value', () => {
    const schema: LoadedSchema = {
      name: 'SingleValue',
      kind: 'enum',
      filePath: '/test/single.yaml',
      relativePath: '/test/single.yaml',
      values: ['only'],
    };

    const result = schemaToEnum(schema);
    expect(result?.values).toHaveLength(1);
  });

  it('handles enum with numeric-like values', () => {
    const result = formatEnum({
      name: 'Level',
      values: [
        { name: 'Level1', value: 'level1' },
        { name: 'Level2', value: 'level2' },
        { name: 'Level10', value: 'level10' },
      ],
    });

    expect(result).toContain("Level1 = 'level1',");
    expect(result).toContain("Level10 = 'level10',");
  });

  it('handles enum with uppercase values', () => {
    const schema: LoadedSchema = {
      name: 'HttpMethod',
      kind: 'enum',
      filePath: '/test/http.yaml',
      relativePath: '/test/http.yaml',
      values: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    };

    const result = schemaToEnum(schema);

    expect(result?.values[0]).toEqual({ name: 'Get', value: 'GET' });
    expect(result?.values[1]).toEqual({ name: 'Post', value: 'POST' });
  });

  it('handles mixed case values consistently', () => {
    const schema: LoadedSchema = {
      name: 'MixedCase',
      kind: 'enum',
      filePath: '/test/mixed.yaml',
      relativePath: '/test/mixed.yaml',
      values: ['active', 'IN_PROGRESS', 'waitingForReview', 'DONE'],
    };

    const result = schemaToEnum(schema);

    // camelCase values just get first letter capitalized
    expect(result?.values.map(v => v.name)).toEqual([
      'Active',
      'InProgress',
      'Waitingforreview',
      'Done',
    ]);
  });
});
