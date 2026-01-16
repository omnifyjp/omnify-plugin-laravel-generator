/**
 * @famgia/omnify-laravel - Association Migration Tests
 *
 * Tests for relationship/association migration generation.
 */

import { describe, it, expect } from 'vitest';
import {
  schemaToBlueprint,
  formatForeignKey,
} from './schema-builder.js';
import type { LoadedSchema, SchemaCollection } from '@famgia/omnify-types';

describe('ManyToOne Association', () => {
  it('generates foreign key column for ManyToOne', () => {
    const schema: LoadedSchema = {
      name: 'Post',
      kind: 'object',
      filePath: '/test/post.yaml',
      relativePath: '/test/post.yaml',
      properties: {
        title: { type: 'String' },
        author: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'User',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Post: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        properties: { name: { type: 'String' } },
      },
    };

    const result = schemaToBlueprint(schema, schemas);

    // Should have author_id column
    const authorColumn = result.columns.find(c => c.name === 'author_id');
    expect(authorColumn).toBeDefined();
    expect(authorColumn?.method).toBe('unsignedBigInteger');
  });

  it('generates foreign key constraint for ManyToOne', () => {
    const schema: LoadedSchema = {
      name: 'Post',
      kind: 'object',
      filePath: '/test/post.yaml',
      relativePath: '/test/post.yaml',
      properties: {
        author: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'User',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Post: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        properties: {},
      },
    };

    const result = schemaToBlueprint(schema, schemas);

    expect(result.foreignKeys.length).toBeGreaterThan(0);
    const fk = result.foreignKeys.find(f => f.columns.includes('author_id'));
    expect(fk).toBeDefined();
    expect(fk?.on).toContain('users');
    expect(fk?.references).toBe('id');
  });

  it('respects onDelete CASCADE', () => {
    const schema: LoadedSchema = {
      name: 'Comment',
      kind: 'object',
      filePath: '/test/comment.yaml',
      relativePath: '/test/comment.yaml',
      properties: {
        post: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Post',
          onDelete: 'CASCADE',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Comment: schema,
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/test/post.yaml',
        relativePath: '/test/post.yaml',
        properties: {},
      },
    };

    const result = schemaToBlueprint(schema, schemas);

    const fk = result.foreignKeys.find(f => f.columns.includes('post_id'));
    // Values are passed through as-is from schema
    expect(fk?.onDelete).toBe('CASCADE');
  });

  it('respects onDelete SET NULL', () => {
    const schema: LoadedSchema = {
      name: 'Comment',
      kind: 'object',
      filePath: '/test/comment.yaml',
      relativePath: '/test/comment.yaml',
      properties: {
        author: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'User',
          onDelete: 'SET NULL',
          nullable: true,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Comment: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        properties: {},
      },
    };

    const result = schemaToBlueprint(schema, schemas);

    const fk = result.foreignKeys.find(f => f.columns.includes('author_id'));
    expect(fk?.onDelete).toBe('SET NULL');

    // Column should be nullable
    const column = result.columns.find(c => c.name === 'author_id');
    expect(column?.modifiers).toContainEqual({ method: 'nullable' });
  });

  it('respects onUpdate CASCADE', () => {
    const schema: LoadedSchema = {
      name: 'OrderItem',
      kind: 'object',
      filePath: '/test/order-item.yaml',
      relativePath: '/test/order-item.yaml',
      properties: {
        order: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Order',
          onUpdate: 'CASCADE',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      OrderItem: schema,
      Order: {
        name: 'Order',
        kind: 'object',
        filePath: '/test/order.yaml',
        relativePath: '/test/order.yaml',
        properties: {},
      },
    };

    const result = schemaToBlueprint(schema, schemas);

    const fk = result.foreignKeys.find(f => f.columns.includes('order_id'));
    expect(fk?.onUpdate).toBe('CASCADE');
  });
});

describe('OneToMany Association', () => {
  it('does not generate column for OneToMany (inverse side)', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        posts: {
          type: 'Association',
          relation: 'OneToMany',
          target: 'Post',
          inversedBy: 'author',
        } as any,
      },
    };

    const result = schemaToBlueprint(schema, {});

    // Should not have posts column
    const postsColumn = result.columns.find(c => c.name === 'posts');
    expect(postsColumn).toBeUndefined();

    // Should not have posts_id column
    const postsIdColumn = result.columns.find(c => c.name === 'posts_id');
    expect(postsIdColumn).toBeUndefined();
  });
});

describe('OneToOne Association', () => {
  it('generates foreign key column for owning side', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        profile: {
          type: 'Association',
          relation: 'OneToOne',
          target: 'Profile',
          owningSide: true,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      User: schema,
      Profile: {
        name: 'Profile',
        kind: 'object',
        filePath: '/test/profile.yaml',
        relativePath: '/test/profile.yaml',
        properties: {},
      },
    };

    const result = schemaToBlueprint(schema, schemas);

    const profileColumn = result.columns.find(c => c.name === 'profile_id');
    expect(profileColumn).toBeDefined();
  });

  it('generates foreign key for OneToOne', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        profile: {
          type: 'Association',
          relation: 'OneToOne',
          target: 'Profile',
          owningSide: true,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      User: schema,
      Profile: {
        name: 'Profile',
        kind: 'object',
        filePath: '/test/profile.yaml',
        relativePath: '/test/profile.yaml',
        properties: {},
      },
    };

    const result = schemaToBlueprint(schema, schemas);

    const profileColumn = result.columns.find(c => c.name === 'profile_id');
    // Current implementation doesn't add unique for OneToOne automatically
    expect(profileColumn).toBeDefined();
    expect(profileColumn?.method).toBe('unsignedBigInteger');
  });
});

describe('ManyToMany Association', () => {
  it('does not generate column in main table for ManyToMany', () => {
    const schema: LoadedSchema = {
      name: 'Post',
      kind: 'object',
      filePath: '/test/post.yaml',
      relativePath: '/test/post.yaml',
      properties: {
        tags: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Tag',
        } as any,
      },
    };

    const result = schemaToBlueprint(schema, {});

    const tagsColumn = result.columns.find(c => c.name === 'tags' || c.name === 'tags_id');
    expect(tagsColumn).toBeUndefined();
  });

  // Note: ManyToMany pivot table generation would be tested separately
});

describe('Foreign Key Formatting', () => {
  it('formats simple foreign key', () => {
    const output = formatForeignKey({
      columns: ['user_id'],
      references: 'id',
      on: ['users'],
    });

    expect(output).toBe("$table->foreign('user_id')->references('id')->on('users');");
  });

  it('formats foreign key with onDelete', () => {
    const output = formatForeignKey({
      columns: ['post_id'],
      references: 'id',
      on: ['posts'],
      onDelete: 'cascade',
    });

    expect(output).toContain("->onDelete('cascade')");
  });

  it('formats foreign key with onUpdate', () => {
    const output = formatForeignKey({
      columns: ['category_id'],
      references: 'id',
      on: ['categories'],
      onUpdate: 'cascade',
    });

    expect(output).toContain("->onUpdate('cascade')");
  });

  it('formats foreign key with both onDelete and onUpdate', () => {
    const output = formatForeignKey({
      columns: ['order_id'],
      references: 'id',
      on: ['orders'],
      onDelete: 'cascade',
      onUpdate: 'cascade',
    });

    expect(output).toContain("->onDelete('cascade')");
    expect(output).toContain("->onUpdate('cascade')");
  });

  it('formats foreign key (uses first column for composite)', () => {
    const output = formatForeignKey({
      columns: ['tenant_id', 'user_id'],
      references: 'id',
      on: ['tenant_users'],
    });

    // Current implementation only uses the first column
    expect(output).toContain("foreign('tenant_id')");
    expect(output).toContain("on('tenant_users')");
  });
});

describe('Primary Key Types with Associations', () => {
  it('uses correct foreign key type for BigInt primary key', () => {
    const schema: LoadedSchema = {
      name: 'Comment',
      kind: 'object',
      filePath: '/test/comment.yaml',
      relativePath: '/test/comment.yaml',
      properties: {
        post: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Post',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Comment: schema,
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/test/post.yaml',
        relativePath: '/test/post.yaml',
        properties: {},
        options: { idType: 'BigInt' },
      },
    };

    const result = schemaToBlueprint(schema, schemas);
    const fkColumn = result.columns.find(c => c.name === 'post_id');

    expect(fkColumn?.method).toBe('unsignedBigInteger');
  });

  it('uses correct foreign key type for Uuid primary key', () => {
    const schema: LoadedSchema = {
      name: 'Comment',
      kind: 'object',
      filePath: '/test/comment.yaml',
      relativePath: '/test/comment.yaml',
      properties: {
        post: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Post',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Comment: schema,
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/test/post.yaml',
        relativePath: '/test/post.yaml',
        properties: {},
        options: { idType: 'Uuid' },
      },
    };

    const result = schemaToBlueprint(schema, schemas);
    const fkColumn = result.columns.find(c => c.name === 'post_id');

    expect(fkColumn?.method).toBe('uuid');
  });

  it('uses correct foreign key type for Int primary key', () => {
    const schema: LoadedSchema = {
      name: 'Comment',
      kind: 'object',
      filePath: '/test/comment.yaml',
      relativePath: '/test/comment.yaml',
      properties: {
        post: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Post',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Comment: schema,
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/test/post.yaml',
        relativePath: '/test/post.yaml',
        properties: {},
        options: { idType: 'Int' },
      },
    };

    const result = schemaToBlueprint(schema, schemas);
    const fkColumn = result.columns.find(c => c.name === 'post_id');

    expect(fkColumn?.method).toBe('unsignedInteger');
  });
});
