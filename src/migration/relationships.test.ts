/**
 * @famgia/omnify-laravel - Comprehensive Relationship Tests
 *
 * Tests all relationship types with onDelete, onUpdate actions.
 */

import { describe, it, expect } from 'vitest';
import { generateMigrations } from './generator.js';
import {
  schemaToBlueprint,
  extractManyToManyRelations,
  generatePivotTableBlueprint,
  generatePivotTableName,
  formatColumnMethod,
} from './schema-builder.js';
import type { LoadedSchema, SchemaCollection } from '@famgia/omnify-types';

// =============================================================================
// Test Schemas - Realistic E-commerce Example
// =============================================================================

const createEcommerceSchemas = (): SchemaCollection => ({
  User: {
    name: 'User',
    kind: 'object',
    filePath: '/schemas/User.yaml',
    relativePath: '/schemas/User.yaml',
    properties: {
      email: { type: 'Email', unique: true },
      name: { type: 'String' },
      // OneToMany: User has many Orders
      orders: {
        type: 'Association',
        relation: 'OneToMany',
        target: 'Order',
        inversedBy: 'user',
      } as any,
      // OneToMany: User has many Reviews
      reviews: {
        type: 'Association',
        relation: 'OneToMany',
        target: 'Review',
        inversedBy: 'user',
      } as any,
    },
    options: { timestamps: true },
  },
  Order: {
    name: 'Order',
    kind: 'object',
    filePath: '/schemas/Order.yaml',
    relativePath: '/schemas/Order.yaml',
    properties: {
      orderNumber: { type: 'String', unique: true },
      total: { type: 'Float' },
      // ManyToOne: Order belongs to User
      user: {
        type: 'Association',
        relation: 'ManyToOne',
        target: 'User',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      } as any,
      // OneToMany: Order has many OrderItems
      items: {
        type: 'Association',
        relation: 'OneToMany',
        target: 'OrderItem',
        inversedBy: 'order',
      } as any,
    },
    options: { timestamps: true, softDelete: true },
  },
  OrderItem: {
    name: 'OrderItem',
    kind: 'object',
    filePath: '/schemas/OrderItem.yaml',
    relativePath: '/schemas/OrderItem.yaml',
    properties: {
      quantity: { type: 'Int' },
      price: { type: 'Float' },
      // ManyToOne: OrderItem belongs to Order
      order: {
        type: 'Association',
        relation: 'ManyToOne',
        target: 'Order',
        onDelete: 'CASCADE',
      } as any,
      // ManyToOne: OrderItem belongs to Product
      product: {
        type: 'Association',
        relation: 'ManyToOne',
        target: 'Product',
        onDelete: 'RESTRICT',
      } as any,
    },
  },
  Product: {
    name: 'Product',
    kind: 'object',
    filePath: '/schemas/Product.yaml',
    relativePath: '/schemas/Product.yaml',
    properties: {
      name: { type: 'String' },
      price: { type: 'Float' },
      description: { type: 'Text', nullable: true },
      // ManyToOne: Product belongs to Category
      category: {
        type: 'Association',
        relation: 'ManyToOne',
        target: 'Category',
        onDelete: 'SET NULL',
        nullable: true,
      } as any,
      // ManyToMany: Product has many Tags
      tags: {
        type: 'Association',
        relation: 'ManyToMany',
        target: 'Tag',
        onDelete: 'CASCADE',
      } as any,
      // OneToMany: Product has many Reviews
      reviews: {
        type: 'Association',
        relation: 'OneToMany',
        target: 'Review',
        inversedBy: 'product',
      } as any,
    },
    options: { timestamps: true },
  },
  Category: {
    name: 'Category',
    kind: 'object',
    filePath: '/schemas/Category.yaml',
    relativePath: '/schemas/Category.yaml',
    properties: {
      name: { type: 'String' },
      slug: { type: 'String', unique: true },
      // Self-referencing: Category can have parent
      parent: {
        type: 'Association',
        relation: 'ManyToOne',
        target: 'Category',
        onDelete: 'SET NULL',
        nullable: true,
      } as any,
      // OneToMany: Category has many Products
      products: {
        type: 'Association',
        relation: 'OneToMany',
        target: 'Product',
        inversedBy: 'category',
      } as any,
    },
  },
  Tag: {
    name: 'Tag',
    kind: 'object',
    filePath: '/schemas/Tag.yaml',
    relativePath: '/schemas/Tag.yaml',
    properties: {
      name: { type: 'String', unique: true },
      // ManyToMany: Tag has many Products (inverse side)
      products: {
        type: 'Association',
        relation: 'ManyToMany',
        target: 'Product',
        mappedBy: 'tags',
      } as any,
    },
  },
  Review: {
    name: 'Review',
    kind: 'object',
    filePath: '/schemas/Review.yaml',
    relativePath: '/schemas/Review.yaml',
    properties: {
      rating: { type: 'Int' },
      comment: { type: 'Text', nullable: true },
      // ManyToOne: Review belongs to User
      user: {
        type: 'Association',
        relation: 'ManyToOne',
        target: 'User',
        onDelete: 'CASCADE',
      } as any,
      // ManyToOne: Review belongs to Product
      product: {
        type: 'Association',
        relation: 'ManyToOne',
        target: 'Product',
        onDelete: 'CASCADE',
      } as any,
    },
    options: { timestamps: true },
  },
});

// =============================================================================
// ManyToOne Tests
// =============================================================================

describe('ManyToOne Relationship', () => {
  it('generates foreign key column', () => {
    const schemas = createEcommerceSchemas();
    const blueprint = schemaToBlueprint(schemas['Order']!, schemas);

    const userIdColumn = blueprint.columns.find(c => c.name === 'user_id');
    expect(userIdColumn).toBeDefined();
    expect(userIdColumn?.method).toBe('unsignedBigInteger');
  });

  it('generates foreign key constraint with CASCADE onDelete', () => {
    const schemas = createEcommerceSchemas();
    const blueprint = schemaToBlueprint(schemas['Order']!, schemas);

    const fk = blueprint.foreignKeys.find(f => f.columns.includes('user_id'));
    expect(fk).toBeDefined();
    expect(fk?.on).toContain('users');
    expect(fk?.references).toBe('id');
    expect(fk?.onDelete).toBe('CASCADE');
    expect(fk?.onUpdate).toBe('CASCADE');
  });

  it('generates foreign key with RESTRICT onDelete', () => {
    const schemas = createEcommerceSchemas();
    const blueprint = schemaToBlueprint(schemas['OrderItem']!, schemas);

    const fk = blueprint.foreignKeys.find(f => f.columns.includes('product_id'));
    expect(fk?.onDelete).toBe('RESTRICT');
  });

  it('generates foreign key with SET NULL onDelete', () => {
    const schemas = createEcommerceSchemas();
    const blueprint = schemaToBlueprint(schemas['Product']!, schemas);

    const fk = blueprint.foreignKeys.find(f => f.columns.includes('category_id'));
    expect(fk?.onDelete).toBe('SET NULL');
  });

  it('handles self-referencing relationship', () => {
    const schemas = createEcommerceSchemas();
    const blueprint = schemaToBlueprint(schemas['Category']!, schemas);

    const parentColumn = blueprint.columns.find(c => c.name === 'parent_id');
    expect(parentColumn).toBeDefined();

    const fk = blueprint.foreignKeys.find(f => f.columns.includes('parent_id'));
    expect(fk?.on).toContain('categories');
    expect(fk?.onDelete).toBe('SET NULL');
  });

  it('creates index for foreign key column', () => {
    const schemas = createEcommerceSchemas();
    const blueprint = schemaToBlueprint(schemas['Order']!, schemas);

    const index = blueprint.indexes.find(i => i.columns.includes('user_id'));
    expect(index).toBeDefined();
    expect(index?.unique).toBe(false);
  });
});

// =============================================================================
// OneToMany Tests
// =============================================================================

describe('OneToMany Relationship', () => {
  it('does NOT generate column for inverse side', () => {
    const schemas = createEcommerceSchemas();
    const blueprint = schemaToBlueprint(schemas['User']!, schemas);

    // User.orders should NOT create a column
    const ordersColumn = blueprint.columns.find(
      c => c.name === 'orders' || c.name === 'orders_id'
    );
    expect(ordersColumn).toBeUndefined();
  });

  it('only owning side (ManyToOne) has the foreign key', () => {
    const schemas = createEcommerceSchemas();

    const userBlueprint = schemaToBlueprint(schemas['User']!, schemas);
    const orderBlueprint = schemaToBlueprint(schemas['Order']!, schemas);

    // User should NOT have order_id
    expect(userBlueprint.foreignKeys.length).toBe(0);

    // Order should have user_id
    const fk = orderBlueprint.foreignKeys.find(f => f.columns.includes('user_id'));
    expect(fk).toBeDefined();
  });
});

// =============================================================================
// OneToOne Tests
// =============================================================================

describe('OneToOne Relationship', () => {
  it('generates foreign key on owning side', () => {
    const schemas: SchemaCollection = {
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {
          email: { type: 'Email' },
          profile: {
            type: 'Association',
            relation: 'OneToOne',
            target: 'Profile',
            owningSide: true,
          } as any,
        },
      },
      Profile: {
        name: 'Profile',
        kind: 'object',
        filePath: '/schemas/Profile.yaml',
        relativePath: '/schemas/Profile.yaml',
        properties: {
          bio: { type: 'Text' },
        },
      },
    };

    const userBlueprint = schemaToBlueprint(schemas['User']!, schemas);

    const profileColumn = userBlueprint.columns.find(c => c.name === 'profile_id');
    expect(profileColumn).toBeDefined();

    const fk = userBlueprint.foreignKeys.find(f => f.columns.includes('profile_id'));
    expect(fk).toBeDefined();
    expect(fk?.on).toContain('profiles');
  });

  it('does NOT generate foreign key on inverse side', () => {
    const schemas: SchemaCollection = {
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {
          email: { type: 'Email' },
        },
      },
      Profile: {
        name: 'Profile',
        kind: 'object',
        filePath: '/schemas/Profile.yaml',
        relativePath: '/schemas/Profile.yaml',
        properties: {
          bio: { type: 'Text' },
          user: {
            type: 'Association',
            relation: 'OneToOne',
            target: 'User',
            mappedBy: 'profile',
          } as any,
        },
      },
    };

    const profileBlueprint = schemaToBlueprint(schemas['Profile']!, schemas);

    // mappedBy means inverse side, no column should be created
    const userColumn = profileBlueprint.columns.find(c => c.name === 'user_id');
    expect(userColumn).toBeUndefined();
  });
});

// =============================================================================
// ManyToMany Tests
// =============================================================================

describe('ManyToMany Relationship', () => {
  it('does NOT generate column in main tables', () => {
    const schemas = createEcommerceSchemas();

    const productBlueprint = schemaToBlueprint(schemas['Product']!, schemas);
    const tagBlueprint = schemaToBlueprint(schemas['Tag']!, schemas);

    // Neither should have direct columns for the relationship
    expect(productBlueprint.columns.find(c => c.name === 'tags')).toBeUndefined();
    expect(productBlueprint.columns.find(c => c.name === 'tag_id')).toBeUndefined();
    expect(tagBlueprint.columns.find(c => c.name === 'products')).toBeUndefined();
    expect(tagBlueprint.columns.find(c => c.name === 'product_id')).toBeUndefined();
  });

  it('extracts pivot table info correctly', () => {
    const schemas = createEcommerceSchemas();
    const pivots = extractManyToManyRelations(schemas['Product']!, schemas);

    expect(pivots.length).toBe(1);
    expect(pivots[0]?.tableName).toBe('product_tag');
    expect(pivots[0]?.sourceColumn).toBe('product_id');
    expect(pivots[0]?.targetColumn).toBe('tag_id');
  });

  it('generates correct pivot table name (alphabetical order)', () => {
    expect(generatePivotTableName('users', 'roles')).toBe('role_user');
    expect(generatePivotTableName('posts', 'tags')).toBe('post_tag');
    expect(generatePivotTableName('categories', 'articles')).toBe('article_category');
  });

  it('generates correct pivot table name for words ending in "ch" (branches, batches, etc.)', () => {
    // This tests the fix for the bug where "branches" was incorrectly singularized to "branche" instead of "branch"
    expect(generatePivotTableName('branches', 'users')).toBe('branch_user');
    expect(generatePivotTableName('batches', 'items')).toBe('batch_item');
    expect(generatePivotTableName('matches', 'teams')).toBe('match_team');
    expect(generatePivotTableName('searches', 'results')).toBe('result_search');
  });

  it('generates correct pivot column names for Branch model', () => {
    const schema: LoadedSchema = {
      name: 'Branch',
      kind: 'object',
      filePath: '/schemas/Branch.yaml',
      relativePath: '/schemas/Branch.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'branch_user',
          owning: true,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Branch: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    expect(pivots.length).toBe(1);
    expect(pivots[0]?.tableName).toBe('branch_user');
    // Critical: should be 'branch_id', NOT 'branche_id'
    expect(pivots[0]?.sourceColumn).toBe('branch_id');
    expect(pivots[0]?.targetColumn).toBe('user_id');
  });

  it('uses custom join table name when provided', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/schemas/User.yaml',
      relativePath: '/schemas/User.yaml',
      properties: {
        roles: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Role',
          joinTable: 'user_role_assignments',
          owning: true,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      User: schema,
      Role: {
        name: 'Role',
        kind: 'object',
        filePath: '/schemas/Role.yaml',
        relativePath: '/schemas/Role.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    expect(pivots[0]?.tableName).toBe('user_role_assignments');
  });

  it('generates pivot table blueprint with correct structure', () => {
    const schemas = createEcommerceSchemas();
    const pivots = extractManyToManyRelations(schemas['Product']!, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    // Check columns (2 FK columns + 2 timestamp columns)
    expect(blueprint.columns.length).toBe(4);
    expect(blueprint.columns.find(c => c.name === 'product_id')).toBeDefined();
    expect(blueprint.columns.find(c => c.name === 'tag_id')).toBeDefined();
    expect(blueprint.columns.find(c => c.name === 'created_at')).toBeDefined();
    expect(blueprint.columns.find(c => c.name === 'updated_at')).toBeDefined();

    // Check foreign keys
    expect(blueprint.foreignKeys.length).toBe(2);

    const productFk = blueprint.foreignKeys.find(f => f.columns.includes('product_id'));
    expect(productFk?.on).toContain('products');
    expect(productFk?.onDelete).toBe('CASCADE');

    const tagFk = blueprint.foreignKeys.find(f => f.columns.includes('tag_id'));
    expect(tagFk?.on).toContain('tags');
    expect(tagFk?.onDelete).toBe('CASCADE');

    // Check composite unique constraint
    const uniqueIndex = blueprint.indexes.find(i => i.unique);
    expect(uniqueIndex?.columns).toContain('product_id');
    expect(uniqueIndex?.columns).toContain('tag_id');
  });

  it('respects custom onDelete for pivot table', () => {
    const schema: LoadedSchema = {
      name: 'Student',
      kind: 'object',
      filePath: '/schemas/Student.yaml',
      relativePath: '/schemas/Student.yaml',
      properties: {
        courses: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Course',
          onDelete: 'RESTRICT',
          owning: true,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Student: schema,
      Course: {
        name: 'Course',
        kind: 'object',
        filePath: '/schemas/Course.yaml',
        relativePath: '/schemas/Course.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    for (const fk of blueprint.foreignKeys) {
      expect(fk.onDelete).toBe('RESTRICT');
    }
  });

  it('only generates pivot table once (owning side)', () => {
    const schemas = createEcommerceSchemas();

    // Product (owning) should generate pivot
    const productPivots = extractManyToManyRelations(schemas['Product']!, schemas);
    expect(productPivots.length).toBe(1);

    // Tag (inverse, has mappedBy) should NOT generate pivot
    const tagPivots = extractManyToManyRelations(schemas['Tag']!, schemas);
    expect(tagPivots.length).toBe(0);
  });

  it('extracts pivotFields from ManyToMany relation', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            org_role: { type: 'String', length: 50, default: 'member' },
            is_default: { type: 'Boolean', default: false },
            joined_at: { type: 'Timestamp', nullable: true },
            invited_by: { type: 'BigInt', nullable: true, unsigned: true },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);

    expect(pivots.length).toBe(1);
    expect(pivots[0]?.pivotFields).toBeDefined();
    expect(pivots[0]?.pivotFields?.length).toBe(4);

    // Check org_role field
    const orgRole = pivots[0]?.pivotFields?.find(f => f.name === 'org_role');
    expect(orgRole?.type).toBe('String');
    expect(orgRole?.length).toBe(50);
    expect(orgRole?.default).toBe('member');

    // Check is_default field
    const isDefault = pivots[0]?.pivotFields?.find(f => f.name === 'is_default');
    expect(isDefault?.type).toBe('Boolean');
    expect(isDefault?.default).toBe(false);

    // Check joined_at field
    const joinedAt = pivots[0]?.pivotFields?.find(f => f.name === 'joined_at');
    expect(joinedAt?.type).toBe('Timestamp');
    expect(joinedAt?.nullable).toBe(true);

    // Check invited_by field
    const invitedBy = pivots[0]?.pivotFields?.find(f => f.name === 'invited_by');
    expect(invitedBy?.type).toBe('BigInt');
    expect(invitedBy?.nullable).toBe(true);
    expect(invitedBy?.unsigned).toBe(true);
  });

  it('extracts Enum pivot fields with enum values', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            org_role: {
              type: 'Enum',
              enum: [
                { value: 'owner', label: { en: 'Owner', ja: 'オーナー' } },
                { value: 'admin', label: { en: 'Administrator', ja: '管理者' } },
                { value: 'member', label: { en: 'Member', ja: 'メンバー' } },
              ],
              default: 'member',
            },
            status: {
              type: 'Enum',
              enum: ['active', 'inactive', 'pending'],
              nullable: true,
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);

    expect(pivots.length).toBe(1);
    expect(pivots[0]?.pivotFields).toBeDefined();
    expect(pivots[0]?.pivotFields?.length).toBe(2);

    // Check org_role field with object enum values (labels should be extracted as string values)
    const orgRole = pivots[0]?.pivotFields?.find(f => f.name === 'org_role');
    expect(orgRole?.type).toBe('Enum');
    expect(orgRole?.enum).toEqual(['owner', 'admin', 'member']);
    expect(orgRole?.default).toBe('member');

    // Check status field with simple string enum values
    const status = pivots[0]?.pivotFields?.find(f => f.name === 'status');
    expect(status?.type).toBe('Enum');
    expect(status?.enum).toEqual(['active', 'inactive', 'pending']);
    expect(status?.nullable).toBe(true);
  });

  it('generates pivot table blueprint with Enum columns', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            org_role: {
              type: 'Enum',
              enum: ['owner', 'admin', 'member'],
              default: 'member',
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    // Find the org_role column
    const orgRoleCol = blueprint.columns.find(c => c.name === 'org_role');
    expect(orgRoleCol).toBeDefined();
    expect(orgRoleCol?.method).toBe('enum');
    expect(orgRoleCol?.args).toEqual(['org_role', ['owner', 'admin', 'member']]);
    expect(orgRoleCol?.modifiers).toContainEqual({ method: 'default', args: ['member'] });
  });

  it('generates pivot table blueprint with nullable Enum column', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            status: {
              type: 'Enum',
              enum: ['active', 'inactive', 'pending'],
              nullable: true,
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    const statusCol = blueprint.columns.find(c => c.name === 'status');
    expect(statusCol).toBeDefined();
    expect(statusCol?.method).toBe('enum');
    expect(statusCol?.args).toEqual(['status', ['active', 'inactive', 'pending']]);
    expect(statusCol?.modifiers).toContainEqual({ method: 'nullable' });
  });

  it('generates pivot table blueprint with multiple Enum columns', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            org_role: {
              type: 'Enum',
              enum: ['owner', 'admin', 'member'],
              default: 'member',
            },
            status: {
              type: 'Enum',
              enum: ['active', 'inactive'],
              nullable: true,
            },
            permission_level: {
              type: 'Enum',
              enum: ['read', 'write', 'admin'],
              default: 'read',
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    // Check all three enum columns
    const orgRoleCol = blueprint.columns.find(c => c.name === 'org_role');
    expect(orgRoleCol?.method).toBe('enum');
    expect(orgRoleCol?.args).toEqual(['org_role', ['owner', 'admin', 'member']]);
    expect(orgRoleCol?.modifiers).toContainEqual({ method: 'default', args: ['member'] });

    const statusCol = blueprint.columns.find(c => c.name === 'status');
    expect(statusCol?.method).toBe('enum');
    expect(statusCol?.args).toEqual(['status', ['active', 'inactive']]);
    expect(statusCol?.modifiers).toContainEqual({ method: 'nullable' });

    const permissionCol = blueprint.columns.find(c => c.name === 'permission_level');
    expect(permissionCol?.method).toBe('enum');
    expect(permissionCol?.args).toEqual(['permission_level', ['read', 'write', 'admin']]);
    expect(permissionCol?.modifiers).toContainEqual({ method: 'default', args: ['read'] });
  });

  it('generates pivot table blueprint with mixed pivot field types including Enum', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            org_role: {
              type: 'Enum',
              enum: ['owner', 'admin', 'member'],
              default: 'member',
            },
            joined_at: {
              type: 'Timestamp',
              nullable: true,
            },
            is_primary: {
              type: 'Boolean',
              default: false,
            },
            notes: {
              type: 'Text',
              nullable: true,
            },
            sort_order: {
              type: 'Int',
              default: 0,
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    // Check enum column
    const orgRoleCol = blueprint.columns.find(c => c.name === 'org_role');
    expect(orgRoleCol?.method).toBe('enum');
    expect(orgRoleCol?.args).toEqual(['org_role', ['owner', 'admin', 'member']]);

    // Check timestamp column
    const joinedAtCol = blueprint.columns.find(c => c.name === 'joined_at');
    expect(joinedAtCol?.method).toBe('timestamp');
    expect(joinedAtCol?.modifiers).toContainEqual({ method: 'nullable' });

    // Check boolean column
    const isPrimaryCol = blueprint.columns.find(c => c.name === 'is_primary');
    expect(isPrimaryCol?.method).toBe('boolean');
    expect(isPrimaryCol?.modifiers).toContainEqual({ method: 'default', args: [false] });

    // Check text column
    const notesCol = blueprint.columns.find(c => c.name === 'notes');
    expect(notesCol?.method).toBe('text');

    // Check int column
    const sortOrderCol = blueprint.columns.find(c => c.name === 'sort_order');
    expect(sortOrderCol?.method).toBe('integer');
    expect(sortOrderCol?.modifiers).toContainEqual({ method: 'default', args: [0] });
  });

  it('extracts Enum pivot fields with localized labels correctly', () => {
    const schema: LoadedSchema = {
      name: 'Team',
      kind: 'object',
      filePath: '/schemas/Team.yaml',
      relativePath: '/schemas/Team.yaml',
      properties: {
        members: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'team_user',
          owning: true,
          pivotFields: {
            team_role: {
              type: 'Enum',
              enum: [
                {
                  value: 'leader',
                  label: { en: 'Team Leader', ja: 'チームリーダー', vi: 'Trưởng nhóm' },
                  extra: { canManage: true }
                },
                {
                  value: 'member',
                  label: { en: 'Team Member', ja: 'チームメンバー', vi: 'Thành viên' },
                  extra: { canManage: false }
                },
                {
                  value: 'observer',
                  label: { en: 'Observer', ja: 'オブザーバー', vi: 'Quan sát viên' },
                  extra: { canManage: false }
                },
              ],
              default: 'member',
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Team: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);

    expect(pivots.length).toBe(1);
    expect(pivots[0]?.pivotFields?.length).toBe(1);

    const teamRole = pivots[0]?.pivotFields?.find(f => f.name === 'team_role');
    expect(teamRole?.type).toBe('Enum');
    // Only string values should be extracted, not labels
    expect(teamRole?.enum).toEqual(['leader', 'member', 'observer']);
    expect(teamRole?.default).toBe('member');
  });

  it('does not include enum field for non-Enum pivot types', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            role_name: {
              type: 'String',
              length: 50,
              default: 'member',
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const roleName = pivots[0]?.pivotFields?.find(f => f.name === 'role_name');

    expect(roleName?.type).toBe('String');
    expect(roleName?.enum).toBeUndefined();  // Should not have enum for String type
  });

  // =============================================================================
  // PHP Code Generation Tests for Enum Pivot Fields
  // =============================================================================

  it('generates correct PHP code for Enum pivot column with default', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            org_role: {
              type: 'Enum',
              enum: ['owner', 'admin', 'member'],
              default: 'member',
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);
    const orgRoleCol = blueprint.columns.find(c => c.name === 'org_role')!;
    const phpCode = formatColumnMethod(orgRoleCol);

    expect(phpCode).toBe("$table->enum('org_role', ['owner', 'admin', 'member'])->default('member');");
  });

  it('generates correct PHP code for Enum pivot column with nullable', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            status: {
              type: 'Enum',
              enum: ['active', 'inactive', 'pending'],
              nullable: true,
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);
    const statusCol = blueprint.columns.find(c => c.name === 'status')!;
    const phpCode = formatColumnMethod(statusCol);

    expect(phpCode).toBe("$table->enum('status', ['active', 'inactive', 'pending'])->nullable();");
  });

  it('generates correct PHP code for Enum pivot column with nullable and default', () => {
    const schema: LoadedSchema = {
      name: 'Team',
      kind: 'object',
      filePath: '/schemas/Team.yaml',
      relativePath: '/schemas/Team.yaml',
      properties: {
        members: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'team_user',
          owning: true,
          pivotFields: {
            membership_type: {
              type: 'Enum',
              enum: ['permanent', 'temporary', 'guest'],
              nullable: true,
              default: 'permanent',
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Team: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);
    const membershipCol = blueprint.columns.find(c => c.name === 'membership_type')!;
    const phpCode = formatColumnMethod(membershipCol);

    expect(phpCode).toBe("$table->enum('membership_type', ['permanent', 'temporary', 'guest'])->nullable()->default('permanent');");
  });

  it('generates correct PHP code for multiple Enum pivot columns', () => {
    const schema: LoadedSchema = {
      name: 'Project',
      kind: 'object',
      filePath: '/schemas/Project.yaml',
      relativePath: '/schemas/Project.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'project_user',
          owning: true,
          pivotFields: {
            role: {
              type: 'Enum',
              enum: ['owner', 'manager', 'developer', 'viewer'],
              default: 'viewer',
            },
            access_level: {
              type: 'Enum',
              enum: ['full', 'limited', 'readonly'],
              default: 'readonly',
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Project: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    const roleCol = blueprint.columns.find(c => c.name === 'role')!;
    const accessCol = blueprint.columns.find(c => c.name === 'access_level')!;

    expect(formatColumnMethod(roleCol)).toBe(
      "$table->enum('role', ['owner', 'manager', 'developer', 'viewer'])->default('viewer');"
    );
    expect(formatColumnMethod(accessCol)).toBe(
      "$table->enum('access_level', ['full', 'limited', 'readonly'])->default('readonly');"
    );
  });

  it('generates correct PHP code for Enum pivot column without modifiers', () => {
    const schema: LoadedSchema = {
      name: 'Category',
      kind: 'object',
      filePath: '/schemas/Category.yaml',
      relativePath: '/schemas/Category.yaml',
      properties: {
        products: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Product',
          joinTable: 'category_product',
          owning: true,
          pivotFields: {
            display_type: {
              type: 'Enum',
              enum: ['featured', 'normal', 'hidden'],
            },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Category: schema,
      Product: {
        name: 'Product',
        kind: 'object',
        filePath: '/schemas/Product.yaml',
        relativePath: '/schemas/Product.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);
    const displayCol = blueprint.columns.find(c => c.name === 'display_type')!;
    const phpCode = formatColumnMethod(displayCol);

    // No modifiers, just the enum column
    expect(phpCode).toBe("$table->enum('display_type', ['featured', 'normal', 'hidden']);");
  });

  it('generates pivot table blueprint with pivotFields columns', () => {
    const schema: LoadedSchema = {
      name: 'Organization',
      kind: 'object',
      filePath: '/schemas/Organization.yaml',
      relativePath: '/schemas/Organization.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'organization_user',
          owning: true,
          pivotFields: {
            org_role: { type: 'String', length: 50, default: 'member' },
            is_default: { type: 'Boolean', default: false },
            joined_at: { type: 'Timestamp', nullable: true },
            invited_by: { type: 'BigInt', nullable: true, unsigned: true },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Organization: schema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    // Check columns (2 FK columns + 4 pivot fields + 2 timestamp columns = 8)
    expect(blueprint.columns.length).toBe(8);

    // Check org_role column
    const orgRoleCol = blueprint.columns.find(c => c.name === 'org_role');
    expect(orgRoleCol).toBeDefined();
    expect(orgRoleCol?.method).toBe('string');
    expect(orgRoleCol?.args).toContain(50);
    expect(orgRoleCol?.modifiers.find(m => m.method === 'default')?.args).toContain('member');

    // Check is_default column
    const isDefaultCol = blueprint.columns.find(c => c.name === 'is_default');
    expect(isDefaultCol).toBeDefined();
    expect(isDefaultCol?.method).toBe('boolean');
    expect(isDefaultCol?.modifiers.find(m => m.method === 'default')?.args).toContain(false);

    // Check joined_at column
    const joinedAtCol = blueprint.columns.find(c => c.name === 'joined_at');
    expect(joinedAtCol).toBeDefined();
    expect(joinedAtCol?.method).toBe('timestamp');
    expect(joinedAtCol?.modifiers.find(m => m.method === 'nullable')).toBeDefined();

    // Check invited_by column
    const invitedByCol = blueprint.columns.find(c => c.name === 'invited_by');
    expect(invitedByCol).toBeDefined();
    expect(invitedByCol?.method).toBe('bigInteger');
    expect(invitedByCol?.modifiers.find(m => m.method === 'nullable')).toBeDefined();
    expect(invitedByCol?.modifiers.find(m => m.method === 'unsigned')).toBeDefined();
  });

  it('does NOT extract pivot table for ManyToMany with mappedBy', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/schemas/User.yaml',
      relativePath: '/schemas/User.yaml',
      properties: {
        organizations: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Organization',
          joinTable: 'organization_user',
          mappedBy: 'users',  // This is the inverse side
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      User: schema,
      Organization: {
        name: 'Organization',
        kind: 'object',
        filePath: '/schemas/Organization.yaml',
        relativePath: '/schemas/Organization.yaml',
        properties: {},
      },
    };

    const pivots = extractManyToManyRelations(schema, schemas);
    expect(pivots.length).toBe(0);  // Should not generate pivot table
  });

  it('generates pivot table when source schema name is alphabetically after target but has pivotFields', () => {
    // Bug scenario: Team (T) → Service (S)
    // Alphabetically "Team" > "Service", so without fix, Team would not be owning side
    // But Team defines pivotFields, so it should be the owning side
    const teamSchema: LoadedSchema = {
      name: 'Team',
      kind: 'object',
      filePath: '/schemas/organization/Team.yaml',
      relativePath: 'organization/Team.yaml',
      properties: {
        services: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Service',
          joinTable: 'team_service',
          pivotFields: {
            role: { type: 'String', length: 50 },
            granted_by: { type: 'BigInt', nullable: true, unsigned: true },
            granted_at: { type: 'Timestamp', nullable: true },
          },
        } as any,
      },
    };

    const serviceSchema: LoadedSchema = {
      name: 'Service',
      kind: 'object',
      filePath: '/schemas/service/Service.yaml',
      relativePath: 'service/Service.yaml',
      properties: {
        teams: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Team',
          joinTable: 'team_service',
          mappedBy: 'services',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Team: teamSchema,
      Service: serviceSchema,
    };

    // Team should generate pivot table even though "Team" > "Service" alphabetically
    const teamPivots = extractManyToManyRelations(teamSchema, schemas);
    expect(teamPivots.length).toBe(1);
    expect(teamPivots[0]?.tableName).toBe('team_service');
    expect(teamPivots[0]?.pivotFields?.length).toBe(3);

    // Service should NOT generate pivot table (inverse side with mappedBy)
    const servicePivots = extractManyToManyRelations(serviceSchema, schemas);
    expect(servicePivots.length).toBe(0);
  });

  it('generates pivot table when target has mappedBy pointing to source (no pivotFields)', () => {
    // Scenario: Team (T) → Service (S) without pivotFields
    // Alphabetically "Team" > "Service", but Service has mappedBy pointing to Team
    // So Team should be the owning side
    const teamSchema: LoadedSchema = {
      name: 'Team',
      kind: 'object',
      filePath: '/schemas/organization/Team.yaml',
      relativePath: 'organization/Team.yaml',
      properties: {
        services: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Service',
          joinTable: 'team_service',
        } as any,
      },
    };

    const serviceSchema: LoadedSchema = {
      name: 'Service',
      kind: 'object',
      filePath: '/schemas/service/Service.yaml',
      relativePath: 'service/Service.yaml',
      properties: {
        teams: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Team',
          joinTable: 'team_service',
          mappedBy: 'services',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Team: teamSchema,
      Service: serviceSchema,
    };

    // Team should generate pivot table because Service has mappedBy: services
    const teamPivots = extractManyToManyRelations(teamSchema, schemas);
    expect(teamPivots.length).toBe(1);
    expect(teamPivots[0]?.tableName).toBe('team_service');

    // Service should NOT generate pivot table (inverse side with mappedBy)
    const servicePivots = extractManyToManyRelations(serviceSchema, schemas);
    expect(servicePivots.length).toBe(0);
  });

  it('handles multiple ManyToMany relations on same entity with different alphabetical ordering', () => {
    // Bug scenario: Team has two ManyToMany relations:
    // 1. Team → User (T < U, alphabetically correct)
    // 2. Team → Service (T > S, alphabetically wrong but has pivotFields)
    const teamSchema: LoadedSchema = {
      name: 'Team',
      kind: 'object',
      filePath: '/schemas/organization/Team.yaml',
      relativePath: 'organization/Team.yaml',
      properties: {
        users: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'User',
          joinTable: 'team_user',
          pivotFields: {
            is_leader: { type: 'Boolean', default: false },
            joined_at: { type: 'Timestamp', nullable: true },
          },
        } as any,
        services: {
          type: 'Association',
          relation: 'ManyToMany',
          target: 'Service',
          joinTable: 'team_service',
          pivotFields: {
            role: { type: 'String', length: 50 },
            granted_at: { type: 'Timestamp', nullable: true },
          },
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Team: teamSchema,
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/auth/User.yaml',
        relativePath: 'auth/User.yaml',
        properties: {
          teams: {
            type: 'Association',
            relation: 'ManyToMany',
            target: 'Team',
            joinTable: 'team_user',
            mappedBy: 'users',
          } as any,
        },
      },
      Service: {
        name: 'Service',
        kind: 'object',
        filePath: '/schemas/service/Service.yaml',
        relativePath: 'service/Service.yaml',
        properties: {
          teams: {
            type: 'Association',
            relation: 'ManyToMany',
            target: 'Team',
            joinTable: 'team_service',
            mappedBy: 'services',
          } as any,
        },
      },
    };

    // Team should generate BOTH pivot tables
    const teamPivots = extractManyToManyRelations(teamSchema, schemas);
    expect(teamPivots.length).toBe(2);

    const teamUserPivot = teamPivots.find(p => p.tableName === 'team_user');
    expect(teamUserPivot).toBeDefined();
    expect(teamUserPivot?.pivotFields?.length).toBe(2);

    const teamServicePivot = teamPivots.find(p => p.tableName === 'team_service');
    expect(teamServicePivot).toBeDefined();
    expect(teamServicePivot?.pivotFields?.length).toBe(2);
  });
});

// =============================================================================
// Referential Actions Tests
// =============================================================================

describe('Referential Actions', () => {
  it('supports CASCADE', () => {
    const schema: LoadedSchema = {
      name: 'Child',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        parent: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Parent',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Child: schema,
      Parent: { name: 'Parent', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const fk = blueprint.foreignKeys[0];

    expect(fk?.onDelete).toBe('CASCADE');
    expect(fk?.onUpdate).toBe('CASCADE');
  });

  it('supports SET NULL', () => {
    const schema: LoadedSchema = {
      name: 'Post',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
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
      Post: schema,
      User: { name: 'User', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const fk = blueprint.foreignKeys[0];

    expect(fk?.onDelete).toBe('SET NULL');
  });

  it('supports RESTRICT', () => {
    const schema: LoadedSchema = {
      name: 'OrderItem',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        product: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Product',
          onDelete: 'RESTRICT',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      OrderItem: schema,
      Product: { name: 'Product', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const fk = blueprint.foreignKeys[0];

    expect(fk?.onDelete).toBe('RESTRICT');
  });

  it('supports NO ACTION', () => {
    const schema: LoadedSchema = {
      name: 'Log',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        user: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'User',
          onDelete: 'NO ACTION',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Log: schema,
      User: { name: 'User', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const fk = blueprint.foreignKeys[0];

    expect(fk?.onDelete).toBe('NO ACTION');
  });

  it('defaults onDelete to RESTRICT and onUpdate to CASCADE', () => {
    const schema: LoadedSchema = {
      name: 'Comment',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        post: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Post',
          // No onDelete/onUpdate specified
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Comment: schema,
      Post: { name: 'Post', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const fk = blueprint.foreignKeys[0];

    expect(fk?.onDelete).toBe('restrict');
    expect(fk?.onUpdate).toBe('cascade');
  });

  it('supports default value for Association', () => {
    const schema: LoadedSchema = {
      name: 'Attendance',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        approval_status: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'ApprovalStatus',
          default: 1,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Attendance: schema,
      ApprovalStatus: { name: 'ApprovalStatus', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const column = blueprint.columns.find(c => c.name === 'approval_status_id');

    expect(column).toBeDefined();
    expect(column?.modifiers).toContainEqual({ method: 'default', args: [1] });
  });

  it('supports nullable: true for Association', () => {
    const schema: LoadedSchema = {
      name: 'Task',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        assignee: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'User',
          nullable: true,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Task: schema,
      User: { name: 'User', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const column = blueprint.columns.find(c => c.name === 'assignee_id');

    expect(column).toBeDefined();
    expect(column?.modifiers).toContainEqual({ method: 'nullable' });
    expect(column?.modifiers).not.toContainEqual(expect.objectContaining({ method: 'default' }));
  });

  it('ManyToOne without nullable specified is NOT NULL by default', () => {
    const schema: LoadedSchema = {
      name: 'Order',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        customer: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Customer',
          // nullable not specified - should default to NOT NULL
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Order: schema,
      Customer: { name: 'Customer', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const column = blueprint.columns.find(c => c.name === 'customer_id');

    expect(column).toBeDefined();
    // Should NOT have nullable modifier
    expect(column?.modifiers).not.toContainEqual({ method: 'nullable' });
  });

  it('ManyToOne with nullable: false is NOT NULL', () => {
    const schema: LoadedSchema = {
      name: 'Invoice',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        order: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Order',
          nullable: false,
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Invoice: schema,
      Order: { name: 'Order', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const column = blueprint.columns.find(c => c.name === 'order_id');

    expect(column).toBeDefined();
    // Should NOT have nullable modifier
    expect(column?.modifiers).not.toContainEqual({ method: 'nullable' });
  });
});

// =============================================================================
// Bug Fixes Tests
// =============================================================================

describe('Bug Fixes', () => {
  describe('Bug 1: Composite Primary Key for Pivot Tables', () => {
    it('pivot table should have composite primary key without individual primary() modifiers', () => {
      const schemas = createEcommerceSchemas();
      const pivots = extractManyToManyRelations(schemas['Product']!, schemas);
      const blueprint = generatePivotTableBlueprint(pivots[0]!);

      // Blueprint should have composite primaryKey
      expect(blueprint.primaryKey).toEqual(['product_id', 'tag_id']);

      // Columns should NOT have individual primary modifiers
      const productIdColumn = blueprint.columns.find(c => c.name === 'product_id');
      const tagIdColumn = blueprint.columns.find(c => c.name === 'tag_id');

      expect(productIdColumn?.modifiers.find(m => m.method === 'primary')).toBeUndefined();
      expect(tagIdColumn?.modifiers.find(m => m.method === 'primary')).toBeUndefined();
    });

    it('migration content should have composite primary key statement', () => {
      const schemas = createEcommerceSchemas();
      const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

      const pivotMigration = migrations.find(m => m.tables[0] === 'product_tag');
      expect(pivotMigration).toBeDefined();

      const content = pivotMigration!.content;

      // Should have composite primary key
      expect(content).toContain("$table->primary(['product_id', 'tag_id'])");

      // Should NOT have individual primary() on columns
      expect(content).not.toMatch(/unsignedBigInteger\('product_id'\)->primary\(\)/);
      expect(content).not.toMatch(/unsignedBigInteger\('tag_id'\)->primary\(\)/);
    });

    it('explicit schema with composite primary key should work correctly', () => {
      const schema: LoadedSchema = {
        name: 'RolePermission',
        kind: 'object',
        filePath: '/test.yaml',
        relativePath: '/test.yaml',
        properties: {
          role_id: { type: 'BigInt', unsigned: true, primary: true },
          permission_id: { type: 'BigInt', unsigned: true, primary: true },
        },
        options: {
          id: false,
          timestamps: true,
        },
      };

      const blueprint = schemaToBlueprint(schema, {});

      // Should have composite primaryKey
      expect(blueprint.primaryKey).toEqual(['role_id', 'permission_id']);

      // Columns should NOT have individual primary modifiers (removed for composite)
      const roleIdColumn = blueprint.columns.find(c => c.name === 'role_id');
      const permissionIdColumn = blueprint.columns.find(c => c.name === 'permission_id');

      expect(roleIdColumn?.modifiers.find(m => m.method === 'primary')).toBeUndefined();
      expect(permissionIdColumn?.modifiers.find(m => m.method === 'primary')).toBeUndefined();
    });
  });

  describe('Bug 1: Skip Auto-generate Pivot When Explicit Schema Exists', () => {
    it('should not generate pivot table migration when explicit schema exists', () => {
      const schemas: SchemaCollection = {
        Role: {
          name: 'Role',
          kind: 'object',
          filePath: '/test.yaml',
          relativePath: '/test.yaml',
          properties: {
            name: { type: 'String' },
            permissions: {
              type: 'Association',
              relation: 'ManyToMany',
              target: 'Permission',
              joinTable: 'role_permissions',
              owning: true,
            } as any,
          },
        },
        Permission: {
          name: 'Permission',
          kind: 'object',
          filePath: '/test.yaml',
          relativePath: '/test.yaml',
          properties: {
            name: { type: 'String' },
            roles: {
              type: 'Association',
              relation: 'ManyToMany',
              target: 'Role',
              joinTable: 'role_permissions',
              mappedBy: 'permissions',
            } as any,
          },
        },
        // 明示的なピボットテーブルスキーマ
        RolePermission: {
          name: 'RolePermission',
          kind: 'object',
          filePath: '/test.yaml',
          relativePath: '/test.yaml',
          properties: {
            role_id: { type: 'BigInt', unsigned: true, primary: true },
            permission_id: { type: 'BigInt', unsigned: true, primary: true },
          },
          options: {
            id: false,
            timestamps: true,
            tableName: 'role_permissions', // 明示的にテーブル名を指定
          },
        },
      };

      const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

      // role_permissions テーブルは1つだけであるべき（明示的なスキーマから）
      const rolePermissionMigrations = migrations.filter(m => m.tables[0] === 'role_permissions');
      expect(rolePermissionMigrations.length).toBe(1);

      // 明示的なスキーマからの migration であることを確認
      const content = rolePermissionMigrations[0]!.content;
      expect(content).toContain("Schema::create('role_permissions'");
    });
  });
});

// =============================================================================
// Full Migration Generation Tests
// =============================================================================

describe('Full Migration Generation', () => {
  it('generates all table migrations including pivot tables', () => {
    const schemas = createEcommerceSchemas();
    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

    // Should have 7 main tables + 1 pivot table
    const tableNames = migrations.map(m => m.tables[0]);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('order_items');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('reviews');
    expect(tableNames).toContain('product_tag'); // Pivot table
  });

  it('pivot table migration has correct content', () => {
    const schemas = createEcommerceSchemas();
    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

    const pivotMigration = migrations.find(m => m.tables[0] === 'product_tag');
    expect(pivotMigration).toBeDefined();

    const content = pivotMigration!.content;

    // Check columns
    expect(content).toContain("unsignedBigInteger('product_id')");
    expect(content).toContain("unsignedBigInteger('tag_id')");

    // Check foreign keys
    expect(content).toContain("->foreign('product_id')");
    expect(content).toContain("->references('id')->on('products')");
    expect(content).toContain("->foreign('tag_id')");
    expect(content).toContain("->references('id')->on('tags')");

    // Check onDelete (uppercase because it comes from schema)
    expect(content).toContain("->onDelete('CASCADE')");
  });

  it('migration content includes correct foreign key actions', () => {
    const schemas = createEcommerceSchemas();
    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

    // Order migration should have CASCADE
    const orderMigration = migrations.find(m => m.tables[0] === 'orders');
    expect(orderMigration?.content).toContain("->onDelete('CASCADE')");

    // Product migration should have SET NULL for category
    const productMigration = migrations.find(m => m.tables[0] === 'products');
    expect(productMigration?.content).toContain("->onDelete('SET NULL')");

    // OrderItem migration should have RESTRICT for product
    const orderItemMigration = migrations.find(m => m.tables[0] === 'order_items');
    expect(orderItemMigration?.content).toContain("->onDelete('RESTRICT')");
  });
});

// =============================================================================
// Primary Key Type Tests with Relationships
// =============================================================================

describe('Primary Key Types in Relationships', () => {
  it('uses UUID for foreign key when target uses UUID primary key', () => {
    const schemas: SchemaCollection = {
      Comment: {
        name: 'Comment',
        kind: 'object',
        filePath: '/test.yaml',
        relativePath: '/test.yaml',
        properties: {
          post: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Post',
          } as any,
        },
      },
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/test.yaml',
        relativePath: '/test.yaml',
        properties: {},
        options: { idType: 'Uuid' },
      },
    };

    const blueprint = schemaToBlueprint(schemas['Comment']!, schemas);
    const fkColumn = blueprint.columns.find(c => c.name === 'post_id');

    expect(fkColumn?.method).toBe('uuid');
  });

  it('uses unsignedInteger for foreign key when target uses Int primary key', () => {
    const schemas: SchemaCollection = {
      Comment: {
        name: 'Comment',
        kind: 'object',
        filePath: '/test.yaml',
        relativePath: '/test.yaml',
        properties: {
          post: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Post',
          } as any,
        },
      },
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/test.yaml',
        relativePath: '/test.yaml',
        properties: {},
        options: { idType: 'Int' },
      },
    };

    const blueprint = schemaToBlueprint(schemas['Comment']!, schemas);
    const fkColumn = blueprint.columns.find(c => c.name === 'post_id');

    expect(fkColumn?.method).toBe('unsignedInteger');
  });

  it('pivot table uses correct types for mixed primary key types', () => {
    const schemas: SchemaCollection = {
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/test.yaml',
        relativePath: '/test.yaml',
        properties: {
          roles: {
            type: 'Association',
            relation: 'ManyToMany',
            target: 'Role',
            owning: true,
          } as any,
        },
        options: { idType: 'Uuid' },
      },
      Role: {
        name: 'Role',
        kind: 'object',
        filePath: '/test.yaml',
        relativePath: '/test.yaml',
        properties: {},
        options: { idType: 'Int' },
      },
    };

    const pivots = extractManyToManyRelations(schemas['User']!, schemas);
    const blueprint = generatePivotTableBlueprint(pivots[0]!);

    const userColumn = blueprint.columns.find(c => c.name === 'user_id');
    const roleColumn = blueprint.columns.find(c => c.name === 'role_id');

    expect(userColumn?.method).toBe('uuid');
    expect(roleColumn?.method).toBe('unsignedInteger');
  });
});

// =============================================================================
// Column Comments Tests (displayName)
// =============================================================================

describe('Column Comments from displayName', () => {
  it('adds comment modifier for regular property with displayName', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        email: {
          type: 'Email',
          displayName: 'Email Address',
        } as any,
        name: {
          type: 'String',
          displayName: 'Full Name',
        } as any,
      },
    };

    const schemas: SchemaCollection = { User: schema };
    const blueprint = schemaToBlueprint(schema, schemas);

    const emailColumn = blueprint.columns.find(c => c.name === 'email');
    expect(emailColumn?.modifiers).toContainEqual({ method: 'comment', args: ['Email Address'] });

    const nameColumn = blueprint.columns.find(c => c.name === 'name');
    expect(nameColumn?.modifiers).toContainEqual({ method: 'comment', args: ['Full Name'] });
  });

  it('adds comment modifier for Association with displayName', () => {
    const schema: LoadedSchema = {
      name: 'Order',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        customer: {
          type: 'Association',
          relation: 'ManyToOne',
          target: 'Customer',
          displayName: 'Order Customer',
        } as any,
      },
    };

    const schemas: SchemaCollection = {
      Order: schema,
      Customer: { name: 'Customer', kind: 'object', filePath: '/test.yaml', relativePath: '/test.yaml', properties: {} },
    };

    const blueprint = schemaToBlueprint(schema, schemas);
    const customerColumn = blueprint.columns.find(c => c.name === 'customer_id');

    expect(customerColumn?.modifiers).toContainEqual({ method: 'comment', args: ['Order Customer'] });
  });

  it('does not add comment modifier when displayName is not specified', () => {
    const schema: LoadedSchema = {
      name: 'User',
      kind: 'object',
      filePath: '/test.yaml',
      relativePath: '/test.yaml',
      properties: {
        email: { type: 'Email' },
      },
    };

    const schemas: SchemaCollection = { User: schema };
    const blueprint = schemaToBlueprint(schema, schemas);

    const emailColumn = blueprint.columns.find(c => c.name === 'email');
    const hasComment = emailColumn?.modifiers.some(m => m.method === 'comment');
    expect(hasComment).toBe(false);
  });

  it('generates correct PHP code with comment modifier', () => {
    const schemas = createEcommerceSchemas();
    // Add displayName to a property for testing
    (schemas['User']!.properties!['email'] as any).displayName = 'User Email';

    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });
    const userMigration = migrations.find(m => m.tables[0] === 'users');

    expect(userMigration?.content).toContain("->comment('User Email')");
  });
});

// =============================================================================
// Pivot Schema Ordering Tests - Edge Cases
// =============================================================================

describe('Pivot Schema Ordering', () => {
  it('pivot schema with pivotFor should be generated AFTER its dependencies', () => {
    // Edge case: PostTag (pivot) depends on both Post and Tag
    // PostTag must be created AFTER both Post and Tag
    const schemas: SchemaCollection = {
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/schemas/Post.yaml',
        relativePath: '/schemas/Post.yaml',
        properties: {
          title: { type: 'String' },
        },
      },
      Tag: {
        name: 'Tag',
        kind: 'object',
        filePath: '/schemas/Tag.yaml',
        relativePath: '/schemas/Tag.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      PostTag: {
        name: 'PostTag',
        kind: 'pivot',
        pivotFor: ['Post', 'Tag'],
        filePath: '/schemas/PostTag.yaml',
        relativePath: '/schemas/PostTag.yaml',
        properties: {
          sort_order: { type: 'Int', default: 0 },
        },
      },
    };

    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });
    const tableOrder = migrations.map(m => m.tables[0]);

    const postIndex = tableOrder.indexOf('posts');
    const tagIndex = tableOrder.indexOf('tags');
    const postTagIndex = tableOrder.indexOf('post_tags');

    // PostTag should come AFTER both Post and Tag
    expect(postTagIndex).toBeGreaterThan(postIndex);
    expect(postTagIndex).toBeGreaterThan(tagIndex);
  });

  it('pivot schema alphabetically later still depends on earlier schemas', () => {
    // Edge case: ZArticleTag (alphabetically last) depends on Article and Tag
    const schemas: SchemaCollection = {
      Article: {
        name: 'Article',
        kind: 'object',
        filePath: '/schemas/Article.yaml',
        relativePath: '/schemas/Article.yaml',
        properties: {
          title: { type: 'String' },
        },
      },
      Tag: {
        name: 'Tag',
        kind: 'object',
        filePath: '/schemas/Tag.yaml',
        relativePath: '/schemas/Tag.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      ZArticleTag: {
        name: 'ZArticleTag',
        kind: 'pivot',
        pivotFor: ['Article', 'Tag'],
        filePath: '/schemas/ZArticleTag.yaml',
        relativePath: '/schemas/ZArticleTag.yaml',
        options: {
          tableName: 'article_tags',
        },
        properties: {},
      },
    };

    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });
    const tableOrder = migrations.map(m => m.tables[0]);

    const articleIndex = tableOrder.indexOf('articles');
    const tagIndex = tableOrder.indexOf('tags');
    const articleTagIndex = tableOrder.indexOf('article_tags');

    expect(articleTagIndex).toBeGreaterThan(articleIndex);
    expect(articleTagIndex).toBeGreaterThan(tagIndex);
  });

  it('pivot schema alphabetically earlier still depends on later schemas', () => {
    // Edge case: APostTag (alphabetically first) depends on Post and Tag
    const schemas: SchemaCollection = {
      APostTag: {
        name: 'APostTag',
        kind: 'pivot',
        pivotFor: ['Post', 'Tag'],
        filePath: '/schemas/APostTag.yaml',
        relativePath: '/schemas/APostTag.yaml',
        options: {
          tableName: 'post_tags',
        },
        properties: {},
      },
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/schemas/Post.yaml',
        relativePath: '/schemas/Post.yaml',
        properties: {
          title: { type: 'String' },
        },
      },
      Tag: {
        name: 'Tag',
        kind: 'object',
        filePath: '/schemas/Tag.yaml',
        relativePath: '/schemas/Tag.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
    };

    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });
    const tableOrder = migrations.map(m => m.tables[0]);

    const postIndex = tableOrder.indexOf('posts');
    const tagIndex = tableOrder.indexOf('tags');
    const postTagIndex = tableOrder.indexOf('post_tags');

    // Even though APostTag is alphabetically first, it should still come after dependencies
    expect(postTagIndex).toBeGreaterThan(postIndex);
    expect(postTagIndex).toBeGreaterThan(tagIndex);
  });

  it('multiple pivot schemas are ordered correctly', () => {
    // Edge case: Multiple pivot tables with overlapping dependencies
    const schemas: SchemaCollection = {
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      Role: {
        name: 'Role',
        kind: 'object',
        filePath: '/schemas/Role.yaml',
        relativePath: '/schemas/Role.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      Permission: {
        name: 'Permission',
        kind: 'object',
        filePath: '/schemas/Permission.yaml',
        relativePath: '/schemas/Permission.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      UserRole: {
        name: 'UserRole',
        kind: 'pivot',
        pivotFor: ['User', 'Role'],
        filePath: '/schemas/UserRole.yaml',
        relativePath: '/schemas/UserRole.yaml',
        options: { tableName: 'user_roles' },
        properties: {},
      },
      RolePermission: {
        name: 'RolePermission',
        kind: 'pivot',
        pivotFor: ['Role', 'Permission'],
        filePath: '/schemas/RolePermission.yaml',
        relativePath: '/schemas/RolePermission.yaml',
        options: { tableName: 'role_permissions' },
        properties: {},
      },
    };

    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });
    const tableOrder = migrations.map(m => m.tables[0]);

    const userIndex = tableOrder.indexOf('users');
    const roleIndex = tableOrder.indexOf('roles');
    const permissionIndex = tableOrder.indexOf('permissions');
    const userRoleIndex = tableOrder.indexOf('user_roles');
    const rolePermissionIndex = tableOrder.indexOf('role_permissions');

    // UserRole should come after User and Role
    expect(userRoleIndex).toBeGreaterThan(userIndex);
    expect(userRoleIndex).toBeGreaterThan(roleIndex);

    // RolePermission should come after Role and Permission
    expect(rolePermissionIndex).toBeGreaterThan(roleIndex);
    expect(rolePermissionIndex).toBeGreaterThan(permissionIndex);
  });

  it('pivot schema with additional FK dependencies', () => {
    // Edge case: Pivot with extra ManyToOne relationship
    const schemas: SchemaCollection = {
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/schemas/Post.yaml',
        relativePath: '/schemas/Post.yaml',
        properties: {
          title: { type: 'String' },
        },
      },
      Tag: {
        name: 'Tag',
        kind: 'object',
        filePath: '/schemas/Tag.yaml',
        relativePath: '/schemas/Tag.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      PostTag: {
        name: 'PostTag',
        kind: 'pivot',
        pivotFor: ['Post', 'Tag'],
        filePath: '/schemas/PostTag.yaml',
        relativePath: '/schemas/PostTag.yaml',
        properties: {
          // Extra FK: who added this tag
          addedBy: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'User',
            nullable: true,
          } as any,
        },
      },
    };

    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });
    const tableOrder = migrations.map(m => m.tables[0]);

    const userIndex = tableOrder.indexOf('users');
    const postIndex = tableOrder.indexOf('posts');
    const tagIndex = tableOrder.indexOf('tags');
    const postTagIndex = tableOrder.indexOf('post_tags');

    // PostTag should come after all: User, Post, and Tag
    expect(postTagIndex).toBeGreaterThan(userIndex);
    expect(postTagIndex).toBeGreaterThan(postIndex);
    expect(postTagIndex).toBeGreaterThan(tagIndex);
  });

  it('handles circular pivot dependencies gracefully', () => {
    // Edge case: Schemas that could create circular dependencies
    // User -> Post (author), Post -> Tag (via pivot), Tag -> User (creator)
    const schemas: SchemaCollection = {
      User: {
        name: 'User',
        kind: 'object',
        filePath: '/schemas/User.yaml',
        relativePath: '/schemas/User.yaml',
        properties: {
          name: { type: 'String' },
        },
      },
      Post: {
        name: 'Post',
        kind: 'object',
        filePath: '/schemas/Post.yaml',
        relativePath: '/schemas/Post.yaml',
        properties: {
          title: { type: 'String' },
          author: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'User',
          } as any,
        },
      },
      Tag: {
        name: 'Tag',
        kind: 'object',
        filePath: '/schemas/Tag.yaml',
        relativePath: '/schemas/Tag.yaml',
        properties: {
          name: { type: 'String' },
          creator: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'User',
            nullable: true,
          } as any,
        },
      },
      PostTag: {
        name: 'PostTag',
        kind: 'pivot',
        pivotFor: ['Post', 'Tag'],
        filePath: '/schemas/PostTag.yaml',
        relativePath: '/schemas/PostTag.yaml',
        properties: {},
      },
    };

    // Should not throw, and should produce valid ordering
    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });
    const tableOrder = migrations.map(m => m.tables[0]);

    // User should be first (no dependencies)
    expect(tableOrder[0]).toBe('users');

    // Post and Tag depend on User, should come after
    const postIndex = tableOrder.indexOf('posts');
    const tagIndex = tableOrder.indexOf('tags');
    expect(postIndex).toBeGreaterThan(0);
    expect(tagIndex).toBeGreaterThan(0);

    // PostTag should come last
    const postTagIndex = tableOrder.indexOf('post_tags');
    expect(postTagIndex).toBeGreaterThan(postIndex);
    expect(postTagIndex).toBeGreaterThan(tagIndex);
  });
});
