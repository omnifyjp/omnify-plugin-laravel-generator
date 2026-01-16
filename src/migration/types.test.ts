/**
 * @famgia/omnify-laravel - Property Types Migration Tests
 *
 * Comprehensive tests for all property types and their Laravel migration output.
 * Based on PHP test suite coverage.
 */

import { describe, it, expect } from 'vitest';
import { propertyToColumnMethod, formatColumnMethod } from './schema-builder.js';

describe('String Type', () => {
  it('generates basic string column', () => {
    const result = propertyToColumnMethod('name', { type: 'String' });
    expect(result?.method).toBe('string');
    expect(result?.args).toEqual(['name']);
  });

  it('generates string with custom length', () => {
    const result = propertyToColumnMethod('code', { type: 'String', length: 50 });
    expect(result?.method).toBe('string');
    expect(result?.args).toEqual(['code', 50]);
  });

  it('generates string with unique constraint', () => {
    const result = propertyToColumnMethod('email', { type: 'String', unique: true });
    expect(result?.modifiers).toContainEqual({ method: 'unique' });
  });

  it('generates nullable string', () => {
    const result = propertyToColumnMethod('nickname', { type: 'String', nullable: true });
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });

  it('generates string with default value', () => {
    const result = propertyToColumnMethod('status', { type: 'String', default: 'active' });
    expect(result?.modifiers).toContainEqual({ method: 'default', args: ['active'] });
  });
});

describe('Text Type', () => {
  it('generates text column', () => {
    const result = propertyToColumnMethod('content', { type: 'Text' });
    expect(result?.method).toBe('text');
  });

  it('generates nullable text', () => {
    const result = propertyToColumnMethod('bio', { type: 'Text', nullable: true });
    expect(result?.method).toBe('text');
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('Int Type', () => {
  it('generates integer column', () => {
    const result = propertyToColumnMethod('age', { type: 'Int' });
    expect(result?.method).toBe('integer');
  });

  it('generates integer with default', () => {
    const result = propertyToColumnMethod('count', { type: 'Int', default: 0 });
    // Defaults preserve native types for proper PHP rendering
    expect(result?.modifiers).toContainEqual({ method: 'default', args: [0] });
  });

  it('generates unsigned integer', () => {
    const result = propertyToColumnMethod('quantity', { type: 'Int', unsigned: true });
    expect(result?.modifiers).toContainEqual({ method: 'unsigned' });
  });
});

describe('BigInt Type', () => {
  it('generates bigInteger column', () => {
    const result = propertyToColumnMethod('views', { type: 'BigInt' });
    expect(result?.method).toBe('bigInteger');
  });

  it('generates unsigned bigInteger', () => {
    const result = propertyToColumnMethod('fileSize', { type: 'BigInt', unsigned: true });
    expect(result?.modifiers).toContainEqual({ method: 'unsigned' });
  });
});

describe('Float Type', () => {
  it('generates double column for Float type', () => {
    const result = propertyToColumnMethod('rating', { type: 'Float' });
    expect(result?.method).toBe('double');
  });

  it('generates nullable float', () => {
    const result = propertyToColumnMethod('score', { type: 'Float', nullable: true });
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('Boolean Type', () => {
  it('generates boolean column', () => {
    const result = propertyToColumnMethod('isActive', { type: 'Boolean' });
    expect(result?.method).toBe('boolean');
    expect(result?.name).toBe('is_active');
  });

  it('generates boolean with default true', () => {
    const result = propertyToColumnMethod('enabled', { type: 'Boolean', default: true });
    // Default values preserve native types for proper PHP rendering
    expect(result?.modifiers).toContainEqual({ method: 'default', args: [true] });
  });

  it('generates boolean with default false', () => {
    const result = propertyToColumnMethod('published', { type: 'Boolean', default: false });
    expect(result?.modifiers).toContainEqual({ method: 'default', args: [false] });
  });
});

describe('Date Type', () => {
  it('generates date column', () => {
    const result = propertyToColumnMethod('birthDate', { type: 'Date' });
    expect(result?.method).toBe('date');
    expect(result?.name).toBe('birth_date');
  });

  it('generates nullable date', () => {
    const result = propertyToColumnMethod('expiresAt', { type: 'Date', nullable: true });
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('DateTime Type', () => {
  it('generates dateTime column', () => {
    const result = propertyToColumnMethod('scheduledAt', { type: 'DateTime' });
    expect(result?.method).toBe('dateTime');
    expect(result?.name).toBe('scheduled_at');
  });

  it('generates nullable dateTime', () => {
    const result = propertyToColumnMethod('startTime', { type: 'DateTime', nullable: true });
    expect(result?.method).toBe('dateTime');
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('Time Type', () => {
  it('generates time column', () => {
    const result = propertyToColumnMethod('openTime', { type: 'Time' });
    expect(result?.method).toBe('time');
    expect(result?.name).toBe('open_time');
  });
});

describe('Timestamp Type', () => {
  it('generates timestamp column', () => {
    const result = propertyToColumnMethod('verifiedAt', { type: 'Timestamp' });
    expect(result?.method).toBe('timestamp');
    expect(result?.name).toBe('verified_at');
  });

  it('generates nullable timestamp', () => {
    const result = propertyToColumnMethod('emailVerifiedAt', { type: 'Timestamp', nullable: true });
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('Uuid Type', () => {
  it('generates string column for Uuid (not in TYPE_METHOD_MAP)', () => {
    const result = propertyToColumnMethod('externalId', { type: 'Uuid' });
    // Uuid is not explicitly mapped for properties, defaults to string
    // (Note: Uuid is used for primary keys via generatePrimaryKeyColumn)
    expect(result?.method).toBe('string');
    expect(result?.name).toBe('external_id');
  });

  it('generates unique uuid', () => {
    const result = propertyToColumnMethod('trackingId', { type: 'Uuid', unique: true });
    expect(result?.modifiers).toContainEqual({ method: 'unique' });
  });
});

describe('Json Type', () => {
  it('generates json column', () => {
    const result = propertyToColumnMethod('metadata', { type: 'Json' });
    expect(result?.method).toBe('json');
  });

  it('generates nullable json', () => {
    const result = propertyToColumnMethod('settings', { type: 'Json', nullable: true });
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('Email Type', () => {
  it('generates string column for email', () => {
    const result = propertyToColumnMethod('email', { type: 'Email' });
    expect(result?.method).toBe('string');
    expect(result?.args).toEqual(['email']);
  });

  it('generates unique email', () => {
    const result = propertyToColumnMethod('email', { type: 'Email', unique: true });
    expect(result?.modifiers).toContainEqual({ method: 'unique' });
  });
});

describe('Url Type', () => {
  it('generates string column for url', () => {
    const result = propertyToColumnMethod('website', { type: 'Url' });
    expect(result?.method).toBe('string');
  });
});

describe('Phone Type', () => {
  it('generates string column for phone', () => {
    const result = propertyToColumnMethod('phone', { type: 'Phone' });
    // Phone is not in TYPE_METHOD_MAP, so it defaults to string
    expect(result?.method).toBe('string');
  });
});

describe('Enum Type', () => {
  it('generates enum column with values', () => {
    const result = propertyToColumnMethod('status', {
      type: 'Enum',
      enum: ['draft', 'published', 'archived']
    });
    expect(result?.method).toBe('enum');
    expect(result?.args).toContain('status');
    expect(result?.args).toContainEqual(['draft', 'published', 'archived']);
  });

  it('generates enum with default value', () => {
    const result = propertyToColumnMethod('role', {
      type: 'Enum',
      enum: ['admin', 'user', 'guest'],
      default: 'user'
    });
    expect(result?.modifiers).toContainEqual({ method: 'default', args: ['user'] });
  });

  it('generates nullable enum', () => {
    const result = propertyToColumnMethod('priority', {
      type: 'Enum',
      enum: ['low', 'medium', 'high'],
      nullable: true
    });
    expect(result?.modifiers).toContainEqual({ method: 'nullable' });
  });
});

describe('Association Type', () => {
  it('returns null for Association (handled separately)', () => {
    const result = propertyToColumnMethod('user', {
      type: 'Association',
      relation: 'ManyToOne',
      target: 'User'
    });
    expect(result).toBeNull();
  });
});

describe('Column Method Formatting', () => {
  it('formats string column correctly', () => {
    const column = propertyToColumnMethod('name', { type: 'String' });
    const output = formatColumnMethod(column!);
    expect(output).toBe("$table->string('name');");
  });

  it('formats string with length correctly', () => {
    const column = propertyToColumnMethod('code', { type: 'String', length: 50 });
    const output = formatColumnMethod(column!);
    expect(output).toBe("$table->string('code', 50);");
  });

  it('formats column with multiple modifiers', () => {
    const column = propertyToColumnMethod('email', {
      type: 'String',
      nullable: true,
      unique: true
    });
    const output = formatColumnMethod(column!);
    expect(output).toContain('->nullable()');
    expect(output).toContain('->unique()');
  });

  it('formats enum column correctly', () => {
    const column = propertyToColumnMethod('status', {
      type: 'Enum',
      enum: ['active', 'inactive']
    });
    const output = formatColumnMethod(column!);
    // Enum args format as array-like
    expect(output).toContain("$table->enum('status'");
  });

  it('formats boolean with default correctly', () => {
    const column = propertyToColumnMethod('isActive', {
      type: 'Boolean',
      default: true
    });
    const output = formatColumnMethod(column!);
    expect(output).toContain("->boolean('is_active')");
    expect(output).toContain("->default(true)");
  });
});
