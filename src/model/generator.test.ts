import { describe, it, expect } from 'vitest';
import { generateModels, type GeneratedModel } from './generator.js';
import type { SchemaCollection, LoadedSchema } from '@famgia/omnify-types';

describe('Laravel Model Generator', () => {
  describe('generateModels', () => {
    const createSchema = (overrides: Partial<LoadedSchema> = {}): LoadedSchema => ({
      name: 'User',
      kind: 'object',
      filePath: '/schemas/auth/User.yaml',
      relativePath: 'auth/User.yaml',
      properties: {
        name: { type: 'String' },
        email: { type: 'String', unique: true },
      },
      ...overrides,
    });

    it('should generate base model, trait, service provider, and entity files', () => {
      const schemas: SchemaCollection = {
        User: createSchema(),
      };

      const models = generateModels(schemas);

      // Should have: BaseModel, Trait, ServiceProvider, Locales, EntityBase, Entity
      expect(models.length).toBe(6);

      const types = models.map(m => m.type);
      expect(types).toContain('base-model');
      expect(types).toContain('trait');
      expect(types).toContain('service-provider');
      expect(types).toContain('locales');
      expect(types).toContain('entity-base');
      expect(types).toContain('entity');
    });

    it('should generate HasLocalizedDisplayName trait in Traits subfolder', () => {
      const schemas: SchemaCollection = {
        User: createSchema(),
      };

      const models = generateModels(schemas);
      const trait = models.find(m => m.type === 'trait');

      expect(trait).toBeDefined();
      expect(trait?.path).toBe('app/Models/OmnifyBase/Traits/HasLocalizedDisplayName.php');
      expect(trait?.content).toContain('namespace App\\Models\\OmnifyBase\\Traits;');
      expect(trait?.content).toContain('trait HasLocalizedDisplayName');
      expect(trait?.content).toContain('public static function displayName');
      expect(trait?.content).toContain('public static function propertyDisplayName');
      expect(trait?.overwrite).toBe(true);
    });

    it('should generate Locales class in Locales subfolder', () => {
      const schemas: SchemaCollection = {
        User: createSchema({
          displayName: {
            ja: 'ユーザー',
            en: 'User',
          },
          properties: {
            name: {
              type: 'String',
              displayName: {
                ja: '氏名',
                en: 'Full Name',
              },
            } as any,
            email: {
              type: 'String',
              displayName: {
                ja: 'メールアドレス',
                en: 'Email Address',
              },
            } as any,
          },
        }),
      };

      const models = generateModels(schemas);
      const locales = models.find(m => m.type === 'locales');

      expect(locales).toBeDefined();
      expect(locales?.path).toBe('app/Models/OmnifyBase/Locales/UserLocales.php');
      expect(locales?.content).toContain('namespace App\\Models\\OmnifyBase\\Locales;');
      expect(locales?.content).toContain('class UserLocales');
      expect(locales?.content).toContain("public const DISPLAY_NAMES = [");
      expect(locales?.content).toContain("'ja' => 'ユーザー'");
      expect(locales?.content).toContain("'en' => 'User'");
      expect(locales?.content).toContain("public const PROPERTY_DISPLAY_NAMES = [");
      expect(locales?.content).toContain("'name' => [");
      expect(locales?.content).toContain("'ja' => '氏名'");
      expect(locales?.content).toContain("'en' => 'Full Name'");
      expect(locales?.overwrite).toBe(true);
    });

    it('should generate entity base model with Locales constants reference', () => {
      const schemas: SchemaCollection = {
        User: createSchema({
          displayName: {
            ja: 'ユーザー',
            en: 'User',
          },
        }),
      };

      const models = generateModels(schemas);
      const entityBase = models.find(m => m.type === 'entity-base');

      expect(entityBase).toBeDefined();
      expect(entityBase?.path).toBe('app/Models/OmnifyBase/UserBaseModel.php');
      expect(entityBase?.content).toContain('use App\\Models\\OmnifyBase\\Traits\\HasLocalizedDisplayName;');
      expect(entityBase?.content).toContain('use App\\Models\\OmnifyBase\\Locales\\UserLocales;');
      expect(entityBase?.content).toContain('use HasLocalizedDisplayName;');
      expect(entityBase?.content).toContain('protected static array $localizedDisplayNames = UserLocales::DISPLAY_NAMES;');
      expect(entityBase?.content).toContain('protected static array $localizedPropertyDisplayNames = UserLocales::PROPERTY_DISPLAY_NAMES;');
    });

    it('should generate authenticatable model with Locales constants reference', () => {
      const schemas: SchemaCollection = {
        User: createSchema({
          options: {
            authenticatable: true,
          },
          displayName: {
            ja: 'ユーザー',
            en: 'User',
          },
        }),
      };

      const models = generateModels(schemas);
      const entityBase = models.find(m => m.type === 'entity-base');

      expect(entityBase).toBeDefined();
      expect(entityBase?.content).toContain('extends Authenticatable');
      expect(entityBase?.content).toContain('use Notifiable;');
      expect(entityBase?.content).toContain('use App\\Models\\OmnifyBase\\Traits\\HasLocalizedDisplayName;');
      expect(entityBase?.content).toContain('use App\\Models\\OmnifyBase\\Locales\\UserLocales;');
      expect(entityBase?.content).toContain('protected static array $localizedDisplayNames = UserLocales::DISPLAY_NAMES;');
    });

    it('should handle string displayName (single locale)', () => {
      const schemas: SchemaCollection = {
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/schemas/blog/Post.yaml',
          relativePath: 'blog/Post.yaml',
          displayName: 'Blog Post',
          properties: {
            title: {
              type: 'String',
              displayName: 'Post Title',
            } as any,
          },
        },
      };

      const models = generateModels(schemas);
      const locales = models.find(m => m.type === 'locales' && m.schemaName === 'Post');

      expect(locales).toBeDefined();
      expect(locales?.content).toContain("'en' => 'Blog Post'");
      expect(locales?.content).toContain("'title' => [");
      expect(locales?.content).toContain("'en' => 'Post Title'");
    });

    it('should handle missing displayName gracefully', () => {
      const schemas: SchemaCollection = {
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/schemas/blog/Post.yaml',
          relativePath: 'blog/Post.yaml',
          properties: {
            title: { type: 'String' },
          },
        },
      };

      const models = generateModels(schemas);
      const locales = models.find(m => m.type === 'locales' && m.schemaName === 'Post');

      expect(locales).toBeDefined();
      // Should have empty arrays for missing displayNames
      expect(locales?.content).toContain('public const DISPLAY_NAMES = [');
      expect(locales?.content).toContain('public const PROPERTY_DISPLAY_NAMES = [');
    });

    it('should escape special characters in PHP strings', () => {
      const schemas: SchemaCollection = {
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/schemas/blog/Post.yaml',
          relativePath: 'blog/Post.yaml',
          displayName: {
            en: "User's Post",
            ja: 'ユーザーの投稿',
          },
          properties: {},
        },
      };

      const models = generateModels(schemas);
      const locales = models.find(m => m.type === 'locales' && m.schemaName === 'Post');

      expect(locales).toBeDefined();
      // Single quotes should be escaped
      expect(locales?.content).toContain("'en' => 'User\\'s Post'");
    });

    it('should generate multiple Locales files for multiple schemas', () => {
      const schemas: SchemaCollection = {
        User: createSchema({
          displayName: { ja: 'ユーザー', en: 'User' },
        }),
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/schemas/blog/Post.yaml',
          relativePath: 'blog/Post.yaml',
          displayName: { ja: '投稿', en: 'Post' },
          properties: {},
        },
        Comment: {
          name: 'Comment',
          kind: 'object',
          filePath: '/schemas/blog/Comment.yaml',
          relativePath: 'blog/Comment.yaml',
          displayName: { ja: 'コメント', en: 'Comment' },
          properties: {},
        },
      };

      const models = generateModels(schemas);
      const localesFiles = models.filter(m => m.type === 'locales');

      expect(localesFiles.length).toBe(3);
      expect(localesFiles.map(l => l.path)).toContain('app/Models/OmnifyBase/Locales/UserLocales.php');
      expect(localesFiles.map(l => l.path)).toContain('app/Models/OmnifyBase/Locales/PostLocales.php');
      expect(localesFiles.map(l => l.path)).toContain('app/Models/OmnifyBase/Locales/CommentLocales.php');
    });

    it('should not generate models for enum schemas', () => {
      const schemas: SchemaCollection = {
        PostStatus: {
          name: 'PostStatus',
          kind: 'enum',
          filePath: '/schemas/blog/PostStatus.yaml',
          relativePath: 'blog/PostStatus.yaml',
          properties: {},
          values: ['draft', 'published'],
        },
      };

      const models = generateModels(schemas);

      // Should only have BaseModel, Trait(s), and ServiceProvider (no entity-base, entity, or locales for enum)
      // Note: 3 files = BaseModel + HasLocalizedDisplayName trait + ServiceProvider
      expect(models.length).toBe(3);
      expect(models.find(m => m.type === 'entity-base')).toBeUndefined();
      expect(models.find(m => m.type === 'locales')).toBeUndefined();
    });

    it('should use custom options for namespaces and paths', () => {
      const schemas: SchemaCollection = {
        User: createSchema(),
      };

      const models = generateModels(schemas, {
        baseModelNamespace: 'Domain\\Models\\Base',
        modelNamespace: 'Domain\\Models',
        baseModelPath: 'src/Domain/Models/Base',
        modelPath: 'src/Domain/Models',
      });

      const trait = models.find(m => m.type === 'trait');
      const locales = models.find(m => m.type === 'locales');
      const entityBase = models.find(m => m.type === 'entity-base');

      expect(trait?.path).toBe('src/Domain/Models/Base/Traits/HasLocalizedDisplayName.php');
      expect(trait?.content).toContain('namespace Domain\\Models\\Base\\Traits;');

      expect(locales?.path).toBe('src/Domain/Models/Base/Locales/UserLocales.php');
      expect(locales?.content).toContain('namespace Domain\\Models\\Base\\Locales;');

      expect(entityBase?.path).toBe('src/Domain/Models/Base/UserBaseModel.php');
      expect(entityBase?.content).toContain('use Domain\\Models\\Base\\Traits\\HasLocalizedDisplayName;');
      expect(entityBase?.content).toContain('use Domain\\Models\\Base\\Locales\\UserLocales;');
    });
  });

  describe('HasLocalizedDisplayName trait content', () => {
    it('should include all required methods', () => {
      const schemas: SchemaCollection = {
        User: {
          name: 'User',
          kind: 'object',
          filePath: '/schemas/auth/User.yaml',
          relativePath: 'auth/User.yaml',
          properties: {},
        },
      };

      const models = generateModels(schemas);
      const trait = models.find(m => m.type === 'trait');

      expect(trait).toBeDefined();

      // Check for all methods
      expect(trait?.content).toContain('public static function displayName(?string $locale = null): string');
      expect(trait?.content).toContain('public static function allDisplayNames(): array');
      expect(trait?.content).toContain('public static function propertyDisplayName(string $property, ?string $locale = null): string');
      expect(trait?.content).toContain('public static function allPropertyDisplayNames(string $property): array');
      expect(trait?.content).toContain('public static function allPropertyDisplayNamesForLocale(?string $locale = null): array');
    });

    it('should use Laravel locale resolution', () => {
      const schemas: SchemaCollection = {
        User: {
          name: 'User',
          kind: 'object',
          filePath: '/schemas/auth/User.yaml',
          relativePath: 'auth/User.yaml',
          properties: {},
        },
      };

      const models = generateModels(schemas);
      const trait = models.find(m => m.type === 'trait');

      expect(trait?.content).toContain('app()->getLocale()');
      expect(trait?.content).toContain("config('app.fallback_locale', 'en')");
      expect(trait?.content).toContain('array_key_first($displayNames)');
    });
  });

  describe('Locales class content', () => {
    it('should generate proper PHP array syntax', () => {
      const schemas: SchemaCollection = {
        User: {
          name: 'User',
          kind: 'object',
          filePath: '/schemas/auth/User.yaml',
          relativePath: 'auth/User.yaml',
          displayName: {
            ja: 'ユーザー',
            en: 'User',
            vi: 'Người dùng',
          },
          properties: {
            name: {
              type: 'String',
              displayName: {
                ja: '氏名',
                en: 'Full Name',
              },
            } as any,
          },
        },
      };

      const models = generateModels(schemas);
      const locales = models.find(m => m.type === 'locales');

      expect(locales).toBeDefined();

      // Check proper formatting
      expect(locales?.content).toMatch(/public const DISPLAY_NAMES = \[\s+/);
      expect(locales?.content).toMatch(/'ja' => 'ユーザー',/);
      expect(locales?.content).toMatch(/'en' => 'User',/);
      expect(locales?.content).toMatch(/'vi' => 'Người dùng',/);

      expect(locales?.content).toMatch(/public const PROPERTY_DISPLAY_NAMES = \[\s+/);
      expect(locales?.content).toMatch(/'name' => \[\s+/);
    });

    it('should include proper PHPDoc comments', () => {
      const schemas: SchemaCollection = {
        User: {
          name: 'User',
          kind: 'object',
          filePath: '/schemas/auth/User.yaml',
          relativePath: 'auth/User.yaml',
          properties: {},
        },
      };

      const models = generateModels(schemas);
      const locales = models.find(m => m.type === 'locales');

      expect(locales?.content).toContain('@var array<string, string>');
      expect(locales?.content).toContain('@var array<string, array<string, string>>');
      expect(locales?.content).toContain('DO NOT EDIT - This file is auto-generated by Omnify');
      expect(locales?.content).toContain('@generated by @famgia/omnify-laravel');
    });
  });
});
