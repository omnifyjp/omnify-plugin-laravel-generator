/**
 * @famgia/omnify-laravel - TypeScript Generator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  toPropertyName,
  toInterfaceName,
  getPropertyType,
  propertyToTSProperties,
  schemaToInterface,
  formatProperty,
  formatInterface,
  generateInterfaces,
} from './interface-generator.js';
import {
  toEnumMemberName,
  schemaToEnum,
  formatEnum,
  generateEnums,
} from './enum-generator.js';
import { generateTypeScriptFile, generateTypeScript } from './generator.js';
import type { LoadedSchema, SchemaCollection } from '@famgia/omnify-types';

describe('TypeScript Interface Generator', () => {
  describe('toPropertyName', () => {
    it('preserves camelCase', () => {
      expect(toPropertyName('firstName')).toBe('firstName');
      expect(toPropertyName('lastName')).toBe('lastName');
    });
  });

  describe('toInterfaceName', () => {
    it('preserves PascalCase', () => {
      expect(toInterfaceName('User')).toBe('User');
      expect(toInterfaceName('BlogPost')).toBe('BlogPost');
    });
  });

  describe('getPropertyType', () => {
    const schemas: SchemaCollection = {};

    it('maps String to string', () => {
      expect(getPropertyType({ type: 'String' }, schemas)).toBe('string');
    });

    it('maps Int to number', () => {
      expect(getPropertyType({ type: 'Int' }, schemas)).toBe('number');
    });

    it('maps BigInt to number', () => {
      expect(getPropertyType({ type: 'BigInt' }, schemas)).toBe('number');
    });

    it('maps Boolean to boolean', () => {
      expect(getPropertyType({ type: 'Boolean' }, schemas)).toBe('boolean');
    });

    it('maps Json to unknown', () => {
      expect(getPropertyType({ type: 'Json' }, schemas)).toBe('unknown');
    });

    it('maps OneToOne association', () => {
      const result = getPropertyType(
        { type: 'Association', relation: 'OneToOne', target: 'Profile' },
        schemas
      );
      expect(result).toBe('Profile');
    });

    it('maps OneToMany association to array', () => {
      const result = getPropertyType(
        { type: 'Association', relation: 'OneToMany', target: 'Post' },
        schemas
      );
      expect(result).toBe('Post[]');
    });

    it('maps ManyToMany association to array', () => {
      const result = getPropertyType(
        { type: 'Association', relation: 'ManyToMany', target: 'Tag' },
        schemas
      );
      expect(result).toBe('Tag[]');
    });

    it('maps inline enum to union type', () => {
      const result = getPropertyType(
        { type: 'Enum', enum: ['active', 'inactive', 'pending'] },
        schemas
      );
      expect(result).toBe("'active' | 'inactive' | 'pending'");
    });
  });

  describe('schemaToInterface', () => {
    it('generates interface from schema', () => {
      const schema: LoadedSchema = {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        displayName: 'User Entity',
        properties: {
          email: { type: 'Email', unique: true },
          name: { type: 'String' },
          age: { type: 'Int', nullable: true },
        },
        options: {
          timestamps: true,
        },
      };

      const result = schemaToInterface(schema, {});

      expect(result.name).toBe('User');
      expect(result.comment).toBe('User Entity');
      expect(result.properties.find(p => p.name === 'id')).toBeDefined();
      expect(result.properties.find(p => p.name === 'email')).toBeDefined();
      expect(result.properties.find(p => p.name === 'name')).toBeDefined();
      expect(result.properties.find(p => p.name === 'age')?.optional).toBe(true);
      expect(result.properties.find(p => p.name === 'createdAt')).toBeDefined();
      expect(result.properties.find(p => p.name === 'updatedAt')).toBeDefined();
    });
  });

  describe('formatProperty', () => {
    it('formats required property', () => {
      const result = formatProperty({
        name: 'email',
        type: 'string',
        optional: false,
        readonly: true,
      });
      expect(result).toBe('  readonly email: string;');
    });

    it('formats optional property', () => {
      const result = formatProperty({
        name: 'bio',
        type: 'string',
        optional: true,
        readonly: true,
      });
      expect(result).toBe('  readonly bio?: string;');
    });

    it('formats property with comment', () => {
      const result = formatProperty({
        name: 'email',
        type: 'string',
        optional: false,
        readonly: true,
        comment: 'User email address',
      });
      expect(result).toContain('/** User email address */');
    });
  });

  describe('formatInterface', () => {
    it('formats complete interface', () => {
      const result = formatInterface({
        name: 'User',
        properties: [
          { name: 'id', type: 'number', optional: false, readonly: true },
          { name: 'email', type: 'string', optional: false, readonly: true },
        ],
        comment: 'User entity',
      });

      expect(result).toContain('export interface User {');
      expect(result).toContain('readonly id: number;');
      expect(result).toContain('readonly email: string;');
    });
  });
});

describe('TypeScript Enum Generator', () => {
  describe('toEnumMemberName', () => {
    it('converts to PascalCase', () => {
      expect(toEnumMemberName('active')).toBe('Active');
      expect(toEnumMemberName('in_progress')).toBe('InProgress');
      expect(toEnumMemberName('ON-HOLD')).toBe('OnHold');
    });
  });

  describe('schemaToEnum', () => {
    it('generates enum from schema', () => {
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
      expect(result?.values[0]).toEqual({ name: 'Active', value: 'active' });
    });

    it('returns null for non-enum schema', () => {
      const schema: LoadedSchema = {
        name: 'User',
        kind: 'object',
        filePath: '/test/user.yaml',
        relativePath: '/test/user.yaml',
        properties: {},
      };

      const result = schemaToEnum(schema);
      expect(result).toBeNull();
    });
  });

  describe('formatEnum', () => {
    it('formats TypeScript enum', () => {
      const result = formatEnum({
        name: 'Status',
        values: [
          { name: 'Active', value: 'active' },
          { name: 'Inactive', value: 'inactive' },
        ],
        comment: 'Status enum',
      });

      expect(result).toContain('export enum Status {');
      expect(result).toContain("Active = 'active',");
      expect(result).toContain("Inactive = 'inactive',");
    });
  });
});

describe('TypeScript File Generator', () => {
  const schemas: SchemaCollection = {
    User: {
      name: 'User',
      kind: 'object',
      filePath: '/test/user.yaml',
      relativePath: '/test/user.yaml',
      properties: {
        email: { type: 'Email' },
        name: { type: 'String' },
      },
      options: { timestamps: true },
    },
    Status: {
      name: 'Status',
      kind: 'enum',
      filePath: '/test/status.yaml',
      relativePath: '/test/status.yaml',
      values: ['active', 'inactive'],
    },
  };

  describe('generateTypeScriptFile', () => {
    it('generates single file with all types', () => {
      const result = generateTypeScriptFile(schemas);

      expect(result.fileName).toBe('types.ts');
      expect(result.content).toContain('// Enums');
      expect(result.content).toContain('export enum Status');
      expect(result.content).toContain('// Interfaces');
      expect(result.content).toContain('export interface User');
    });
  });

  describe('generateTypeScript', () => {
    it('generates single file by default', () => {
      const result = generateTypeScript(schemas);

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('types.ts');
    });

    it('generates multiple files when singleFile is false', () => {
      const result = generateTypeScript(schemas, { singleFile: false });

      expect(result.length).toBeGreaterThan(1);
      expect(result.find(f => f.fileName === 'index.ts')).toBeDefined();
    });
  });
});

// ===========================================================================
// Polymorphic TypeScript Tests
// ===========================================================================

describe('TypeScript Polymorphic Generator', () => {
  const schemas: SchemaCollection = {
    Post: {
      name: 'Post',
      filePath: '/test/post.yaml',
      relativePath: 'post.yaml',
    },
    Video: {
      name: 'Video',
      filePath: '/test/video.yaml',
      relativePath: 'video.yaml',
    },
    Comment: {
      name: 'Comment',
      filePath: '/test/comment.yaml',
      relativePath: 'comment.yaml',
    },
  };

  describe('getPropertyType - Polymorphic', () => {
    it('maps MorphTo to union type', () => {
      const result = getPropertyType(
        {
          type: 'Association',
          relation: 'MorphTo',
          targets: ['Post', 'Video'],
        } as any,
        schemas
      );
      expect(result).toBe('Post | Video');
    });

    it('maps MorphOne to single type', () => {
      const result = getPropertyType(
        {
          type: 'Association',
          relation: 'MorphOne',
          target: 'Image',
          morphName: 'imageable',
        } as any,
        schemas
      );
      expect(result).toBe('Image');
    });

    it('maps MorphMany to array type', () => {
      const result = getPropertyType(
        {
          type: 'Association',
          relation: 'MorphMany',
          target: 'Comment',
          morphName: 'commentable',
        } as any,
        schemas
      );
      expect(result).toBe('Comment[]');
    });

    it('maps MorphToMany to array type', () => {
      const result = getPropertyType(
        {
          type: 'Association',
          relation: 'MorphToMany',
          target: 'Tag',
        } as any,
        schemas
      );
      expect(result).toBe('Tag[]');
    });

    it('maps MorphedByMany to array type', () => {
      const result = getPropertyType(
        {
          type: 'Association',
          relation: 'MorphedByMany',
          target: 'Post',
          morphName: 'taggable',
        } as any,
        schemas
      );
      expect(result).toBe('Post[]');
    });
  });

  describe('propertyToTSProperties - Polymorphic', () => {
    it('returns multiple properties for MorphTo', () => {
      const result = propertyToTSProperties(
        'commentable',
        {
          type: 'Association',
          relation: 'MorphTo',
          targets: ['Post', 'Video'],
        } as any,
        schemas
      );

      expect(result).toHaveLength(3);

      // Type column
      const typeProp = result.find(p => p.name === 'commentableType');
      expect(typeProp).toBeDefined();
      expect(typeProp?.type).toBe("'Post' | 'Video'");
      expect(typeProp?.optional).toBe(true);

      // ID column
      const idProp = result.find(p => p.name === 'commentableId');
      expect(idProp).toBeDefined();
      expect(idProp?.type).toBe('number');
      expect(idProp?.optional).toBe(true);

      // Relation property
      const relationProp = result.find(p => p.name === 'commentable');
      expect(relationProp).toBeDefined();
      expect(relationProp?.type).toBe('Post | Video | null');
      expect(relationProp?.optional).toBe(true);
    });

    it('returns single property for non-MorphTo associations', () => {
      const result = propertyToTSProperties(
        'comments',
        {
          type: 'Association',
          relation: 'MorphMany',
          target: 'Comment',
          morphName: 'commentable',
        } as any,
        schemas
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('comments');
      expect(result[0].type).toBe('Comment[]');
    });
  });

  describe('schemaToInterface - Polymorphic', () => {
    it('includes polymorphic properties for MorphTo', () => {
      const schema: LoadedSchema = {
        name: 'Comment',
        kind: 'object',
        filePath: '/test/comment.yaml',
        relativePath: 'comment.yaml',
        properties: {
          content: { type: 'Text' },
          commentable: {
            type: 'Association',
            relation: 'MorphTo',
            targets: ['Post', 'Video'],
          } as any,
        },
        options: { timestamps: false },
      };

      const result = schemaToInterface(schema, schemas);

      // Should have: id, content, commentableType, commentableId, commentable
      expect(result.properties.find(p => p.name === 'commentableType')).toBeDefined();
      expect(result.properties.find(p => p.name === 'commentableId')).toBeDefined();
      expect(result.properties.find(p => p.name === 'commentable')).toBeDefined();
    });
  });

  describe('generateTypeScriptFile - Polymorphic', () => {
    it('generates correct types for polymorphic schema', () => {
      const schemasWithPolymorphic: SchemaCollection = {
        Comment: {
          name: 'Comment',
          kind: 'object',
          filePath: '/test/comment.yaml',
          relativePath: 'comment.yaml',
          properties: {
            content: { type: 'Text' },
            commentable: {
              type: 'Association',
              relation: 'MorphTo',
              targets: ['Post', 'Video'],
            } as any,
          },
          options: { timestamps: false },
        },
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/test/post.yaml',
          relativePath: 'post.yaml',
          properties: {
            title: { type: 'String' },
            comments: {
              type: 'Association',
              relation: 'MorphMany',
              target: 'Comment',
              morphName: 'commentable',
            } as any,
          },
          options: { timestamps: false },
        },
        Video: {
          name: 'Video',
          kind: 'object',
          filePath: '/test/video.yaml',
          relativePath: 'video.yaml',
          properties: {
            url: { type: 'String' },
          },
          options: { timestamps: false },
        },
      };

      const result = generateTypeScriptFile(schemasWithPolymorphic);

      expect(result.content).toContain('commentableType');
      expect(result.content).toContain('commentableId');
      expect(result.content).toContain("'Post' | 'Video'");
      expect(result.content).toContain('Comment[]');
    });
  });
});
