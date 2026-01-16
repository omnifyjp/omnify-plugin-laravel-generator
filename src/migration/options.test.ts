/**
 * @famgia/omnify-laravel - Schema Options Migration Tests
 *
 * Tests for schema options like timestamps, softDelete, indexes, etc.
 */

import { describe, it, expect } from 'vitest';
import {
  schemaToBlueprint,
  generatePrimaryKeyColumn,
  generateTimestampColumns,
  generateSoftDeleteColumn,
  formatIndex,
} from './schema-builder.js';
import type { LoadedSchema } from '@famgia/omnify-types';

describe('Timestamps Option', () => {
  it('generates created_at and updated_at when timestamps is true', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        name: { type: 'String' },
      },
      options: {
        timestamps: true,
      },
    };

    const result = schemaToBlueprint(schema, {});

    expect(result.columns.find(c => c.name === 'created_at')).toBeDefined();
    expect(result.columns.find(c => c.name === 'updated_at')).toBeDefined();
  });

  it('does not generate timestamps when timestamps is false', () => {
    const schema: LoadedSchema = {
      name: 'Log',
      kind: 'object',
      filePath: '/test/log.yaml',
      relativePath: '/test/log.yaml',
      properties: {
        message: { type: 'String' },
      },
      options: {
        timestamps: false,
      },
    };

    const result = schemaToBlueprint(schema, {});

    expect(result.columns.find(c => c.name === 'created_at')).toBeUndefined();
    expect(result.columns.find(c => c.name === 'updated_at')).toBeUndefined();
  });

  it('generates default timestamp field names', () => {
    const columns = generateTimestampColumns();

    expect(columns.find(c => c.name === 'created_at')).toBeDefined();
    expect(columns.find(c => c.name === 'updated_at')).toBeDefined();
  });
});

describe('SoftDelete Option', () => {
  it('generates deleted_at when softDelete is true', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        name: { type: 'String' },
      },
      options: {
        softDelete: true,
      },
    };

    const result = schemaToBlueprint(schema, {});

    const deletedAt = result.columns.find(c => c.name === 'deleted_at');
    expect(deletedAt).toBeDefined();
    expect(deletedAt?.method).toBe('timestamp');
    expect(deletedAt?.modifiers).toContainEqual({ method: 'nullable' });
  });

  it('does not generate deleted_at when softDelete is false', () => {
    const schema: LoadedSchema = {
      name: 'Log',
      kind: 'object',
      filePath: '/test/log.yaml',
      relativePath: '/test/log.yaml',
      properties: {
        message: { type: 'String' },
      },
      options: {
        softDelete: false,
      },
    };

    const result = schemaToBlueprint(schema, {});

    expect(result.columns.find(c => c.name === 'deleted_at')).toBeUndefined();
  });

  it('generates softDelete with default field name', () => {
    const column = generateSoftDeleteColumn();

    expect(column.name).toBe('deleted_at');
    expect(column.method).toBe('timestamp');
    expect(column.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('Primary Key Options', () => {
  it('generates auto-incrementing BigInt primary key by default', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        name: { type: 'String' },
      },
    };

    const result = schemaToBlueprint(schema, {});

    const id = result.columns.find(c => c.name === 'id');
    expect(id).toBeDefined();
    expect(id?.method).toBe('id');
  });

  it('generates Int primary key when idType is Int', () => {
    const schema: LoadedSchema = {
      name: 'SmallTable',
      kind: 'object',
      filePath: '/test/small.yaml',
      relativePath: '/test/small.yaml',
      properties: {},
      options: {
        idType: 'Int',
      },
    };

    const result = schemaToBlueprint(schema, {});

    const id = result.columns.find(c => c.name === 'id');
    expect(id?.method).toBe('increments');
  });

  it('generates Uuid primary key when idType is Uuid', () => {
    const schema: LoadedSchema = {
      name: 'Document',
      kind: 'object',
      filePath: '/test/document.yaml',
      relativePath: '/test/document.yaml',
      properties: {},
      options: {
        idType: 'Uuid',
      },
    };

    const result = schemaToBlueprint(schema, {});

    const id = result.columns.find(c => c.name === 'id');
    expect(id?.method).toBe('uuid');
    expect(id?.modifiers).toContainEqual({ method: 'primary' });
  });

  it('generates String primary key when idType is String', () => {
    const schema: LoadedSchema = {
      name: 'Config',
      kind: 'object',
      filePath: '/test/config.yaml',
      relativePath: '/test/config.yaml',
      properties: {},
      options: {
        idType: 'String',
      },
    };

    const result = schemaToBlueprint(schema, {});

    const id = result.columns.find(c => c.name === 'id');
    expect(id?.method).toBe('string');
    expect(id?.modifiers).toContainEqual({ method: 'primary' });
  });

  it('does not generate id column when id is false (for pivot tables)', () => {
    const schema: LoadedSchema = {
      name: 'UserRole',
      kind: 'object',
      filePath: '/test/user-role.yaml',
      relativePath: '/test/user-role.yaml',
      properties: {
        userId: { type: 'Int' },
        roleId: { type: 'Int' },
      },
      options: {
        id: false,
        timestamps: false,
      },
    };

    const result = schemaToBlueprint(schema, {});

    const id = result.columns.find(c => c.name === 'id');
    expect(id).toBeUndefined();
    // Should only have the userId and roleId columns
    expect(result.columns).toHaveLength(2);
  });

  it('uses default primary key field name', () => {
    const column = generatePrimaryKeyColumn('BigInt');

    expect(column.name).toBe('id');
    expect(column.method).toBe('id');
  });
});

describe('Index Options', () => {
  it('generates single column index', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        email: { type: 'String' },
      },
      options: {
        indexes: [
          { columns: ['email'] },
        ],
      },
    };

    const result = schemaToBlueprint(schema, {});

    expect(result.indexes).toHaveLength(1);
    expect(result.indexes[0].columns).toContain('email');
    expect(result.indexes[0].unique).toBe(false);
  });

  it('generates composite index', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        firstName: { type: 'String' },
        lastName: { type: 'String' },
      },
      options: {
        indexes: [
          { columns: ['first_name', 'last_name'] },
        ],
      },
    };

    const result = schemaToBlueprint(schema, {});

    expect(result.indexes[0].columns).toContain('first_name');
    expect(result.indexes[0].columns).toContain('last_name');
  });

  it('generates named index', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        email: { type: 'String' },
      },
      options: {
        indexes: [
          { name: 'idx_user_email', columns: ['email'] },
        ],
      },
    };

    const result = schemaToBlueprint(schema, {});

    expect(result.indexes[0].name).toBe('idx_user_email');
  });
});

describe('Unique Constraints', () => {
  it('generates unique constraint on single column', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        email: { type: 'String', unique: true },
      },
    };

    const result = schemaToBlueprint(schema, {});

    const emailColumn = result.columns.find(c => c.name === 'email');
    expect(emailColumn?.modifiers).toContainEqual({ method: 'unique' });
  });

  it('generates composite unique constraint via options', () => {
    const schema: LoadedSchema = {
      name: 'UserRole',
      kind: 'object',
      filePath: '/test/user-role.yaml',
      relativePath: '/test/user-role.yaml',
      properties: {
        userId: { type: 'Int' },
        roleId: { type: 'Int' },
      },
      options: {
        unique: [['user_id', 'role_id']],
      },
    };

    const result = schemaToBlueprint(schema, {});

    const uniqueIndex = result.indexes.find(i => i.unique && i.columns.length === 2);
    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex?.columns).toContain('user_id');
    expect(uniqueIndex?.columns).toContain('role_id');
  });
});

describe('Table Name Option', () => {
  it('uses default table name from schema name', () => {
    const schema: LoadedSchema = {
      name: 'UserProfile',
      kind: 'object',
      filePath: '/test/user-profile.yaml',
      relativePath: '/test/user-profile.yaml',
      properties: {},
    };

    const result = schemaToBlueprint(schema, {});

    expect(result.tableName).toBe('user_profiles');
  });

  it('generates table name from schema name', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {},
    };

    const result = schemaToBlueprint(schema, {});

    // Current implementation always uses generated name from schema name
    expect(result.tableName).toBe('users');
  });
});

describe('Index Formatting', () => {
  it('formats single column index', () => {
    const output = formatIndex({
      columns: ['email'],
      unique: false,
    });

    expect(output).toBe("$table->index('email');");
  });

  it('formats composite index', () => {
    const output = formatIndex({
      columns: ['first_name', 'last_name'],
      unique: false,
    });

    expect(output).toBe("$table->index(['first_name', 'last_name']);");
  });

  it('formats unique index', () => {
    const output = formatIndex({
      columns: ['email'],
      unique: true,
    });

    expect(output).toBe("$table->unique('email');");
  });

  it('formats composite unique index', () => {
    const output = formatIndex({
      columns: ['user_id', 'role_id'],
      unique: true,
    });

    expect(output).toBe("$table->unique(['user_id', 'role_id']);");
  });

  it('formats named index', () => {
    const output = formatIndex({
      name: 'idx_users_email',
      columns: ['email'],
      unique: false,
    });

    expect(output).toBe("$table->index('email', 'idx_users_email');");
  });

  it('formats named composite unique index', () => {
    const output = formatIndex({
      name: 'uniq_user_role',
      columns: ['user_id', 'role_id'],
      unique: true,
    });

    expect(output).toBe("$table->unique(['user_id', 'role_id'], 'uniq_user_role');");
  });
});

describe('Combined Options', () => {
  it('handles all options together', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        email: { type: 'Email', unique: true },
        name: { type: 'String' },
        status: { type: 'Enum', enum: ['active', 'inactive'] } as any,
      },
      options: {
        timestamps: true,
        softDelete: true,
        idType: 'Uuid',
        indexes: [
          { columns: ['name'] },
        ],
      },
    };

    const result = schemaToBlueprint(schema, {});

    // Primary key
    const id = result.columns.find(c => c.name === 'id');
    expect(id?.method).toBe('uuid');

    // Properties
    expect(result.columns.find(c => c.name === 'email')).toBeDefined();
    expect(result.columns.find(c => c.name === 'name')).toBeDefined();
    expect(result.columns.find(c => c.name === 'status')).toBeDefined();

    // Timestamps
    expect(result.columns.find(c => c.name === 'created_at')).toBeDefined();
    expect(result.columns.find(c => c.name === 'updated_at')).toBeDefined();

    // Soft delete
    expect(result.columns.find(c => c.name === 'deleted_at')).toBeDefined();

    // Indexes
    expect(result.indexes.length).toBeGreaterThan(0);
  });
});
