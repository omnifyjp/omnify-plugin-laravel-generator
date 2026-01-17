/**
 * @famgia/omnify-laravel - Schema Builder Tests
 */

import { describe, it, expect } from 'vitest';
import {
  toColumnName,
  toTableName,
  propertyToColumnMethod,
  generatePrimaryKeyColumn,
  generateTimestampColumns,
  generateSoftDeleteColumn,
  generatePolymorphicColumns,
  schemaToBlueprint,
  formatColumnMethod,
  formatForeignKey,
  formatIndex,
  extractMorphToManyRelations,
  generateMorphToManyPivotBlueprint,
} from './schema-builder.js';
import type { LoadedSchema, SchemaCollection } from '@famgia/omnify-types';

describe('Schema Builder', () => {
  describe('toColumnName', () => {
    it('converts camelCase to snake_case', () => {
      expect(toColumnName('firstName')).toBe('first_name');
      expect(toColumnName('lastName')).toBe('last_name');
      expect(toColumnName('createdAt')).toBe('created_at');
    });

    it('handles single word', () => {
      expect(toColumnName('name')).toBe('name');
      expect(toColumnName('email')).toBe('email');
    });

    it('handles already snake_case', () => {
      expect(toColumnName('user_id')).toBe('user_id');
    });
  });

  describe('toTableName', () => {
    it('converts PascalCase to snake_case and pluralizes', () => {
      expect(toTableName('User')).toBe('users');
      expect(toTableName('BlogPost')).toBe('blog_posts');
      expect(toTableName('Category')).toBe('categories');
    });

    it('handles special pluralization', () => {
      expect(toTableName('Company')).toBe('companies');
      expect(toTableName('Status')).toBe('statuses');
      expect(toTableName('Box')).toBe('boxes');
    });
  });

  describe('propertyToColumnMethod', () => {
    it('maps String type', () => {
      const result = propertyToColumnMethod('name', { type: 'String' });
      expect(result).toEqual({
        name: 'name',
        method: 'string',
        args: ['name'],
        modifiers: [],
      });
    });

    it('maps Int type', () => {
      const result = propertyToColumnMethod('age', { type: 'Int' });
      expect(result).toEqual({
        name: 'age',
        method: 'integer',
        args: ['age'],
        modifiers: [],
      });
    });

    it('maps Boolean type', () => {
      const result = propertyToColumnMethod('isActive', { type: 'Boolean' });
      expect(result).toEqual({
        name: 'is_active',
        method: 'boolean',
        args: ['is_active'],
        modifiers: [],
      });
    });

    it('adds nullable modifier', () => {
      const result = propertyToColumnMethod('bio', { type: 'Text', nullable: true });
      expect(result?.modifiers).toContainEqual({ method: 'nullable' });
    });

    it('adds unique modifier', () => {
      const result = propertyToColumnMethod('email', { type: 'Email', unique: true });
      expect(result?.modifiers).toContainEqual({ method: 'unique' });
    });

    it('adds default modifier', () => {
      const result = propertyToColumnMethod('status', { type: 'String', default: 'active' });
      expect(result?.modifiers).toContainEqual({ method: 'default', args: ['active'] });
    });

    it('returns null for Association type', () => {
      const result = propertyToColumnMethod('user', { type: 'Association', relation: 'ManyToOne', target: 'User' });
      expect(result).toBeNull();
    });

    it('adds primary modifier for custom primary key', () => {
      const result = propertyToColumnMethod('key', { type: 'String', primary: true });
      expect(result?.modifiers).toContainEqual({ method: 'primary' });
    });

    it('handles primary with other modifiers', () => {
      const result = propertyToColumnMethod('ownerId', { type: 'Int', primary: true });
      expect(result?.modifiers).toContainEqual({ method: 'primary' });
      expect(result?.modifiers).not.toContainEqual({ method: 'nullable' });
    });
  });

  describe('generatePrimaryKeyColumn', () => {
    it('generates BigInt primary key', () => {
      const result = generatePrimaryKeyColumn('BigInt');
      expect(result.method).toBe('id');
      expect(result.name).toBe('id');
    });

    it('generates Int primary key', () => {
      const result = generatePrimaryKeyColumn('Int');
      expect(result.method).toBe('increments');
    });

    it('generates Uuid primary key', () => {
      const result = generatePrimaryKeyColumn('Uuid');
      expect(result.method).toBe('uuid');
      expect(result.modifiers).toContainEqual({ method: 'primary' });
    });

    it('generates String primary key', () => {
      const result = generatePrimaryKeyColumn('String');
      expect(result.method).toBe('string');
      expect(result.modifiers).toContainEqual({ method: 'primary' });
    });
  });

  describe('generateTimestampColumns', () => {
    it('generates created_at and updated_at', () => {
      const result = generateTimestampColumns();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('created_at');
      expect(result[1].name).toBe('updated_at');
    });
  });

  describe('generateSoftDeleteColumn', () => {
    it('generates deleted_at column', () => {
      const result = generateSoftDeleteColumn();
      expect(result.name).toBe('deleted_at');
      expect(result.method).toBe('timestamp');
      expect(result.modifiers).toContainEqual({ method: 'nullable' });
    });
  });

  describe('schemaToBlueprint', () => {
    it('generates blueprint from schema', () => {
      const schema: LoadedSchema = {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        properties: {
          email: { type: 'Email', unique: true },
          name: { type: 'String' },
        },
        options: {
          timestamps: true,
          softDelete: true,
        },
      };

      const result = schemaToBlueprint(schema, {});

      expect(result.tableName).toBe('users');
      expect(result.columns.length).toBeGreaterThan(0);
      expect(result.columns.find(c => c.name === 'id')).toBeDefined();
      expect(result.columns.find(c => c.name === 'email')).toBeDefined();
      expect(result.columns.find(c => c.name === 'name')).toBeDefined();
      expect(result.columns.find(c => c.name === 'created_at')).toBeDefined();
      expect(result.columns.find(c => c.name === 'deleted_at')).toBeDefined();
      expect(result.primaryKey).toEqual(['id']);
    });

    it('generates blueprint with id: false (no auto id column)', () => {
      const schema: LoadedSchema = {
        name: 'Cache',
        kind: 'object',
        filePath: '/test/cache.yaml',
        relativePath: '/test/cache.yaml',
        properties: {
          key: { type: 'String', primary: true },
          value: { type: 'Text' },
          expiration: { type: 'Int' },
        },
        options: {
          id: false,
          timestamps: false,
        },
      };

      const result = schemaToBlueprint(schema, {});

      expect(result.tableName).toBe('caches');
      // Should NOT have auto-generated id column
      expect(result.columns.find(c => c.name === 'id')).toBeUndefined();
      // Should have key column with primary modifier
      const keyColumn = result.columns.find(c => c.name === 'key');
      expect(keyColumn).toBeDefined();
      expect(keyColumn?.modifiers).toContainEqual({ method: 'primary' });
      // Should have value and expiration columns
      expect(result.columns.find(c => c.name === 'value')).toBeDefined();
      expect(result.columns.find(c => c.name === 'expiration')).toBeDefined();
      // Primary key should be the key column
      expect(result.primaryKey).toEqual(['key']);
    });

    it('generates blueprint with composite primary key (modifiers removed for composite)', () => {
      const schema: LoadedSchema = {
        name: 'UserRole',
        kind: 'object',
        filePath: '/test/user-role.yaml',
        relativePath: '/test/user-role.yaml',
        properties: {
          userId: { type: 'BigInt', primary: true },
          roleId: { type: 'BigInt', primary: true },
          assignedAt: { type: 'DateTime' },
        },
        options: {
          id: false,
          timestamps: false,
        },
      };

      const result = schemaToBlueprint(schema, {});

      expect(result.tableName).toBe('user_roles');
      // Should NOT have auto-generated id column
      expect(result.columns.find(c => c.name === 'id')).toBeUndefined();
      // 複合主キーの場合、個別カラムからprimaryモディファイアが削除されるべき
      const userIdColumn = result.columns.find(c => c.name === 'user_id');
      const roleIdColumn = result.columns.find(c => c.name === 'role_id');
      expect(userIdColumn?.modifiers).not.toContainEqual({ method: 'primary' });
      expect(roleIdColumn?.modifiers).not.toContainEqual({ method: 'primary' });
      // Primary key should include both columns
      expect(result.primaryKey).toEqual(['user_id', 'role_id']);
    });

    it('does not create duplicate FK column when explicit column and Association exist', () => {
      // Bug 2: 明示的なFKカラムとAssociationの両方がある場合、重複しないこと
      const schema: LoadedSchema = {
        name: 'TeamPermission',
        kind: 'object',
        filePath: '/test/team-permission.yaml',
        relativePath: '/test/team-permission.yaml',
        properties: {
          permission_id: { type: 'BigInt', unsigned: true },
          permission: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Permission',
            onDelete: 'CASCADE',
          } as any,
        },
        options: {
          timestamps: false,
        },
      };

      const schemas: SchemaCollection = {
        TeamPermission: schema,
        Permission: {
          name: 'Permission',
          kind: 'object',
          filePath: '/test/permission.yaml',
          relativePath: '/test/permission.yaml',
          properties: {},
        },
      };

      const result = schemaToBlueprint(schema, schemas);

      // permission_id カラムは1つだけであるべき
      const permissionIdColumns = result.columns.filter(c => c.name === 'permission_id');
      expect(permissionIdColumns.length).toBe(1);

      // FK制約は存在するべき
      expect(result.foreignKeys.length).toBe(1);
      expect(result.foreignKeys[0].columns).toContain('permission_id');
    });

    it('generates blueprint with id: false and no custom primary key', () => {
      // This is a valid scenario for append-only tables or junction tables
      const schema: LoadedSchema = {
        name: 'EventLog',
        kind: 'object',
        filePath: '/test/event-log.yaml',
        relativePath: '/test/event-log.yaml',
        properties: {
          eventType: { type: 'String' },
          payload: { type: 'Json' },
          createdAt: { type: 'DateTime' },
        },
        options: {
          id: false,
          timestamps: false,
        },
      };

      const result = schemaToBlueprint(schema, {});

      expect(result.tableName).toBe('event_logs');
      // Should NOT have auto-generated id column
      expect(result.columns.find(c => c.name === 'id')).toBeUndefined();
      // Primary key should be undefined (no auto id, no custom pk)
      expect(result.primaryKey).toBeUndefined();
    });

    it('uses custom tableName from options', () => {
      const schema: LoadedSchema = {
        name: 'AppCache',
        kind: 'object',
        filePath: '/test/app-cache.yaml',
        relativePath: '/test/app-cache.yaml',
        properties: {
          key: { type: 'String', primary: true },
          value: { type: 'Text' },
          expiration: { type: 'Int' },
        },
        options: {
          id: false,
          timestamps: false,
          tableName: 'cache',
        },
      };

      const result = schemaToBlueprint(schema, {});

      // Should use custom tableName instead of deriving from schema name
      expect(result.tableName).toBe('cache');
    });

    it('falls back to derived tableName when options.tableName is not set', () => {
      const schema: LoadedSchema = {
        name: 'AppCache',
        kind: 'object',
        filePath: '/test/app-cache.yaml',
        relativePath: '/test/app-cache.yaml',
        properties: {
          key: { type: 'String', primary: true },
          value: { type: 'Text' },
        },
        options: {
          id: false,
          timestamps: false,
        },
      };

      const result = schemaToBlueprint(schema, {});

      // Should derive tableName from schema name (app_caches)
      expect(result.tableName).toBe('app_caches');
    });
  });

  describe('formatColumnMethod', () => {
    it('formats simple column', () => {
      const result = formatColumnMethod({
        name: 'name',
        method: 'string',
        args: ['name'],
        modifiers: [],
      });
      expect(result).toBe("$table->string('name');");
    });

    it('formats column with length', () => {
      const result = formatColumnMethod({
        name: 'name',
        method: 'string',
        args: ['name', 100],
        modifiers: [],
      });
      expect(result).toBe("$table->string('name', 100);");
    });

    it('formats column with modifiers', () => {
      const result = formatColumnMethod({
        name: 'email',
        method: 'string',
        args: ['email'],
        modifiers: [{ method: 'nullable' }, { method: 'unique' }],
      });
      expect(result).toBe("$table->string('email')->nullable()->unique();");
    });

    it('formats column with default', () => {
      const result = formatColumnMethod({
        name: 'status',
        method: 'string',
        args: ['status'],
        modifiers: [{ method: 'default', args: ['active'] }],
      });
      expect(result).toBe("$table->string('status')->default('active');");
    });
  });

  describe('formatForeignKey', () => {
    it('formats foreign key constraint', () => {
      const result = formatForeignKey({
        columns: ['user_id'],
        references: 'id',
        on: ['users'],
        onDelete: 'cascade',
        onUpdate: 'cascade',
      });
      expect(result).toBe(
        "$table->foreign('user_id')->references('id')->on('users')->onDelete('cascade')->onUpdate('cascade');"
      );
    });
  });

  describe('formatIndex', () => {
    it('formats single column index', () => {
      const result = formatIndex({
        columns: ['email'],
        unique: false,
      });
      expect(result).toBe("$table->index('email');");
    });

    it('formats unique index', () => {
      const result = formatIndex({
        columns: ['email'],
        unique: true,
      });
      expect(result).toBe("$table->unique('email');");
    });

    it('formats composite index', () => {
      const result = formatIndex({
        columns: ['first_name', 'last_name'],
        unique: false,
      });
      expect(result).toBe("$table->index(['first_name', 'last_name']);");
    });

    it('formats named index', () => {
      const result = formatIndex({
        name: 'idx_email',
        columns: ['email'],
        unique: false,
      });
      expect(result).toBe("$table->index('email', 'idx_email');");
    });
  });

  // ===========================================================================
  // Polymorphic Tests
  // ===========================================================================

  describe('generatePolymorphicColumns', () => {
    const allSchemas: SchemaCollection = {
      Post: {
        name: 'Post',
        filePath: '/schemas/Post.yaml',
        relativePath: 'Post.yaml',
        options: { idType: 'BigInt' },
      },
      Video: {
        name: 'Video',
        filePath: '/schemas/Video.yaml',
        relativePath: 'Video.yaml',
        options: { idType: 'BigInt' },
      },
      Image: {
        name: 'Image',
        filePath: '/schemas/Image.yaml',
        relativePath: 'Image.yaml',
        options: { idType: 'Uuid' },
      },
    };

    it('returns null for non-Association types', () => {
      const result = generatePolymorphicColumns('name', { type: 'String' }, allSchemas);
      expect(result).toBeNull();
    });

    it('returns null for non-MorphTo associations', () => {
      const result = generatePolymorphicColumns(
        'author',
        { type: 'Association', relation: 'ManyToOne', target: 'User' } as any,
        allSchemas
      );
      expect(result).toBeNull();
    });

    it('generates polymorphic columns for MorphTo', () => {
      const result = generatePolymorphicColumns(
        'commentable',
        {
          type: 'Association',
          relation: 'MorphTo',
          targets: ['Post', 'Video'],
        } as any,
        allSchemas
      );

      expect(result).not.toBeNull();
      expect(result!.typeColumn.name).toBe('commentable_type');
      expect(result!.typeColumn.method).toBe('enum');
      expect(result!.typeColumn.args).toEqual(['commentable_type', ['Post', 'Video']]);
      expect(result!.typeColumn.modifiers).toContainEqual({ method: 'nullable' });

      expect(result!.idColumn.name).toBe('commentable_id');
      expect(result!.idColumn.method).toBe('unsignedBigInteger');
      expect(result!.idColumn.modifiers).toContainEqual({ method: 'nullable' });

      expect(result!.indexes).toHaveLength(1);
      expect(result!.indexes[0].columns).toEqual(['commentable_type', 'commentable_id']);
    });

    it('uses string(36) for id column when targets have mixed ID types (UUID + BigInt)', () => {
      const result = generatePolymorphicColumns(
        'imageable',
        {
          type: 'Association',
          relation: 'MorphTo',
          targets: ['Post', 'Image'], // Post uses BigInt, Image uses UUID - mixed types
        } as any,
        allSchemas
      );

      expect(result).not.toBeNull();
      // Mixed ID types should use string(36) to accommodate both
      expect(result!.idColumn.method).toBe('string');
      expect(result!.idColumn.args).toEqual(['imageable_id', 36]);
    });

    it('uses string(36) for id column when all targets use UUID', () => {
      const uuidOnlySchemas: SchemaCollection = {
        ...allSchemas,
        Post: {
          ...allSchemas['Post'],
          options: { idType: 'Uuid' },
        },
      };

      const result = generatePolymorphicColumns(
        'imageable',
        {
          type: 'Association',
          relation: 'MorphTo',
          targets: ['Post', 'Image'], // Both use UUID
        } as any,
        uuidOnlySchemas
      );

      expect(result).not.toBeNull();
      // All UUID targets use string(36) for consistency
      expect(result!.idColumn.method).toBe('string');
      expect(result!.idColumn.args).toEqual(['imageable_id', 36]);
    });

    it('uses unsignedBigInteger for id column when all targets use BigInt', () => {
      const bigIntOnlySchemas: SchemaCollection = {
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/schemas/Post.yaml',
          relativePath: '/schemas/Post.yaml',
          properties: {},
          // No idType = default BigInt
        },
        Comment: {
          name: 'Comment',
          kind: 'object',
          filePath: '/schemas/Comment.yaml',
          relativePath: '/schemas/Comment.yaml',
          properties: {},
          // No idType = default BigInt
        },
      };

      const result = generatePolymorphicColumns(
        'commentable',
        {
          type: 'Association',
          relation: 'MorphTo',
          targets: ['Post', 'Comment'],
        } as any,
        bigIntOnlySchemas
      );

      expect(result).not.toBeNull();
      // All BigInt targets use unsignedBigInteger
      expect(result!.idColumn.method).toBe('unsignedBigInteger');
      expect(result!.idColumn.args).toEqual(['commentable_id']);
    });

    it('converts camelCase property name to snake_case', () => {
      const result = generatePolymorphicColumns(
        'taggableItem',
        {
          type: 'Association',
          relation: 'MorphTo',
          targets: ['Post'],
        } as any,
        allSchemas
      );

      expect(result).not.toBeNull();
      expect(result!.typeColumn.name).toBe('taggable_item_type');
      expect(result!.idColumn.name).toBe('taggable_item_id');
    });
  });

  describe('schemaToBlueprint - Polymorphic', () => {
    const createSchema = (name: string, overrides: Partial<LoadedSchema> = {}): LoadedSchema => ({
      name,
      filePath: `/schemas/${name}.yaml`,
      relativePath: `${name}.yaml`,
      ...overrides,
    });

    it('includes polymorphic columns for MorphTo', () => {
      const schema = createSchema('Comment', {
        properties: {
          content: { type: 'Text' },
          commentable: {
            type: 'Association',
            relation: 'MorphTo',
            targets: ['Post', 'Video'],
          } as any,
        },
      });

      const allSchemas: SchemaCollection = {
        Comment: schema,
        Post: createSchema('Post'),
        Video: createSchema('Video'),
      };

      const blueprint = schemaToBlueprint(schema, allSchemas);

      // Should have: id, content, commentable_type, commentable_id, created_at, updated_at
      expect(blueprint.columns.some(c => c.name === 'commentable_type')).toBe(true);
      expect(blueprint.columns.some(c => c.name === 'commentable_id')).toBe(true);

      // Type column should be enum
      const typeCol = blueprint.columns.find(c => c.name === 'commentable_type');
      expect(typeCol?.method).toBe('enum');
      expect(typeCol?.args).toContain('commentable_type');

      // Should have composite index for polymorphic lookup
      expect(blueprint.indexes.some(i =>
        i.columns.includes('commentable_type') && i.columns.includes('commentable_id')
      )).toBe(true);
    });
  });

  describe('extractMorphToManyRelations', () => {
    const createSchema = (name: string, overrides: Partial<LoadedSchema> = {}): LoadedSchema => ({
      name,
      filePath: `/schemas/${name}.yaml`,
      relativePath: `${name}.yaml`,
      ...overrides,
    });

    it('returns empty array when no properties', () => {
      const schema = createSchema('Post');
      const result = extractMorphToManyRelations(schema, {});
      expect(result).toHaveLength(0);
    });

    it('returns empty array when no MorphToMany', () => {
      const schema = createSchema('Post', {
        properties: {
          title: { type: 'String' },
        },
      });
      const result = extractMorphToManyRelations(schema, {});
      expect(result).toHaveLength(0);
    });

    it('extracts MorphToMany relations', () => {
      const postSchema = createSchema('Post', {
        properties: {
          title: { type: 'String' },
          tags: {
            type: 'Association',
            relation: 'MorphToMany',
            target: 'Tag',
          } as any,
        },
      });

      const tagSchema = createSchema('Tag', {
        properties: {
          name: { type: 'String' },
        },
      });

      const allSchemas: SchemaCollection = {
        Post: postSchema,
        Tag: tagSchema,
      };

      const result = extractMorphToManyRelations(postSchema, allSchemas);

      expect(result).toHaveLength(1);
      expect(result[0].tableName).toBe('tagables'); // tags -> tag + ables
      expect(result[0].targetTable).toBe('tags');
      expect(result[0].targetColumn).toBe('tag_id');
      expect(result[0].morphName).toBe('tagable');
      expect(result[0].morphTargets).toContain('Post');
    });
  });

  describe('generateMorphToManyPivotBlueprint', () => {
    it('generates correct pivot table structure', () => {
      const blueprint = generateMorphToManyPivotBlueprint({
        tableName: 'taggables',
        targetTable: 'tags',
        targetColumn: 'tag_id',
        targetPkType: 'BigInt',
        morphName: 'taggable',
        morphTargets: ['Post', 'Video'],
        onDelete: 'cascade',
        onUpdate: undefined,
      });

      expect(blueprint.tableName).toBe('taggables');

      // Should have tag_id, taggable_type, taggable_id columns
      expect(blueprint.columns).toHaveLength(3);
      expect(blueprint.columns.some(c => c.name === 'tag_id')).toBe(true);
      expect(blueprint.columns.some(c => c.name === 'taggable_type')).toBe(true);
      expect(blueprint.columns.some(c => c.name === 'taggable_id')).toBe(true);

      // Type column should be enum with morph targets
      const typeCol = blueprint.columns.find(c => c.name === 'taggable_type');
      expect(typeCol?.method).toBe('enum');
      expect(typeCol?.args).toEqual(['taggable_type', ['Post', 'Video']]);

      // Should have foreign key for target
      expect(blueprint.foreignKeys).toHaveLength(1);
      expect(blueprint.foreignKeys[0].columns).toEqual(['tag_id']);
      expect(blueprint.foreignKeys[0].on).toEqual(['tags']);

      // Should have unique index on all three columns
      expect(blueprint.indexes.some(i =>
        i.unique && i.columns.length === 3
      )).toBe(true);

      // Should have index on morphable columns
      expect(blueprint.indexes.some(i =>
        !i.unique &&
        i.columns.includes('taggable_type') &&
        i.columns.includes('taggable_id')
      )).toBe(true);
    });
  });
});
