/**
 * @famgia/omnify-laravel - Plugin Tests
 */

import { describe, it, expect } from 'vitest';
import laravelPlugin, { type LaravelPluginOptions } from './plugin.js';
import type { GeneratorContext, PluginLogger, SchemaCollection, SchemaChange } from '@famgia/omnify-types';

describe('laravelPlugin', () => {
  const mockLogger: PluginLogger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
  };

  const createContext = (
    schemas: SchemaCollection = {},
    changes?: readonly SchemaChange[]
  ): GeneratorContext => ({
    schemas,
    changes,
    pluginConfig: {},
    cwd: '/test',
    logger: mockLogger,
    previousOutputs: new Map(),
    customTypes: new Map(),
    pluginEnums: new Map(),
  });

  describe('plugin creation', () => {
    it('creates plugin with default options (all generators enabled)', () => {
      const plugin = laravelPlugin();

      expect(plugin.name).toBe('@famgia/omnify-laravel');
      expect(plugin.version).toBe('0.0.14');
      // Default: migrations + models + factories + requests + resources + ai-guides = 6
      expect(plugin.generators).toHaveLength(6);
      expect(plugin.generators![0].name).toBe('laravel-migrations');
      expect(plugin.generators![1].name).toBe('laravel-models');
      expect(plugin.generators![2].name).toBe('laravel-factories');
      expect(plugin.generators![3].name).toBe('laravel-requests');
      expect(plugin.generators![4].name).toBe('laravel-resources');
      expect(plugin.generators![5].name).toBe('laravel-ai-guides');
    });

    it('creates plugin with custom migrations path', () => {
      const options: LaravelPluginOptions = {
        migrationsPath: 'custom/migrations',
      };

      const plugin = laravelPlugin(options);
      // Default: 6 generators (migrations + models + factories + requests + resources + ai-guides)
      expect(plugin.generators).toHaveLength(6);
    });

    it('creates plugin with database connection', () => {
      const plugin = laravelPlugin({
        connection: 'mysql',
      });

      // Default: 6 generators
      expect(plugin.generators).toHaveLength(6);
    });

    it('creates plugin without optional generators when disabled', () => {
      const plugin = laravelPlugin({
        generateModels: false,
        generateFactories: false,
        generateRequests: false,
        generateResources: false,
      });

      // Only migrations + ai-guides = 2
      expect(plugin.generators).toHaveLength(2);
      expect(plugin.generators![0].name).toBe('laravel-migrations');
      expect(plugin.generators![1].name).toBe('laravel-ai-guides');
    });

    it('exposes configSchema for GUI settings', () => {
      const plugin = laravelPlugin();

      expect(plugin.configSchema).toBeDefined();
      // 15 fields: base + paths + toggles for models, factories, requests, resources
      expect(plugin.configSchema!.fields).toHaveLength(15);

      // Verify key fields are present
      const fieldKeys = plugin.configSchema!.fields.map(f => f.key);
      expect(fieldKeys).toContain('base');
      expect(fieldKeys).toContain('migrationsPath');
      expect(fieldKeys).toContain('modelsPath');
      expect(fieldKeys).toContain('baseModelsPath');
      expect(fieldKeys).toContain('providersPath');
      expect(fieldKeys).toContain('generateModels');
      expect(fieldKeys).toContain('factoriesPath');
      expect(fieldKeys).toContain('generateFactories');
      expect(fieldKeys).toContain('connection');
      expect(fieldKeys).toContain('requestsPath');
      expect(fieldKeys).toContain('baseRequestsPath');
      expect(fieldKeys).toContain('generateRequests');
      expect(fieldKeys).toContain('resourcesPath');
      expect(fieldKeys).toContain('baseResourcesPath');
      expect(fieldKeys).toContain('generateResources');
    });
  });

  describe('laravel-migrations generator', () => {
    it('generates migration files', async () => {
      const plugin = laravelPlugin();
      const generator = plugin.generators![0];

      const schemas: SchemaCollection = {
        User: {
          name: 'User',
          kind: 'object',
          filePath: '/test/user.yaml',
          relativePath: '/test/user.yaml',
          properties: {
            name: { type: 'String' },
            email: { type: 'Email', unique: true },
          },
          options: { timestamps: true },
        },
      };

      const ctx = createContext(schemas);
      const outputs = await generator.generate(ctx);

      expect(outputs).toHaveLength(1);
      expect(outputs[0].path).toContain('database/migrations/');
      expect(outputs[0].path).toContain('create_users_table.php');
      expect(outputs[0].type).toBe('migration');
      expect(outputs[0].content).toContain("Schema::create('users'");
      expect(outputs[0].content).toContain("$table->string('email')");
    });

    it('uses custom migrations path', async () => {
      const plugin = laravelPlugin({
        migrationsPath: 'custom/db/migrations',
      });
      const generator = plugin.generators![0];

      const schemas: SchemaCollection = {
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/test/post.yaml',
          relativePath: '/test/post.yaml',
          properties: {},
        },
      };

      const outputs = await generator.generate(createContext(schemas));

      expect(outputs[0].path).toContain('custom/db/migrations/');
    });

    it('generates migration with all options', async () => {
      const plugin = laravelPlugin({
        migrationsPath: 'database/migrations',
        connection: 'pgsql',
      });
      const generator = plugin.generators![0];

      const schemas: SchemaCollection = {
        Article: {
          name: 'Article',
          kind: 'object',
          filePath: '/test/article.yaml',
          relativePath: '/test/article.yaml',
          properties: {
            title: { type: 'String' },
            content: { type: 'Text' },
          },
          options: {
            timestamps: true,
            softDelete: true,
          },
        },
      };

      const outputs = await generator.generate(createContext(schemas));

      expect(outputs).toHaveLength(1);
      expect(outputs[0].content).toContain("Schema::create('articles'");
    });
  });

  describe('laravel-models generator', () => {
    it('generates model files', async () => {
      const plugin = laravelPlugin();
      const generator = plugin.generators![1];

      const schemas: SchemaCollection = {
        User: {
          name: 'User',
          kind: 'object',
          filePath: '/test/user.yaml',
          relativePath: '/test/user.yaml',
          properties: {
            name: { type: 'String' },
            email: { type: 'Email', unique: true },
          },
          options: { timestamps: true },
        },
      };

      const ctx = createContext(schemas);
      const outputs = await generator.generate(ctx);

      // Should generate: BaseModel, UserBaseModel, User
      expect(outputs.length).toBeGreaterThanOrEqual(3);

      // Check BaseModel
      const baseModel = outputs.find(o => o.path.includes('BaseModel.php'));
      expect(baseModel).toBeDefined();
      expect(baseModel!.content).toContain('class BaseModel extends Model');

      // Check UserBaseModel
      const userBaseModel = outputs.find(o => o.path.includes('UserBaseModel.php'));
      expect(userBaseModel).toBeDefined();
      expect(userBaseModel!.content).toContain('class UserBaseModel extends BaseModel');
      expect(userBaseModel!.content).toContain("protected $table = 'users'");

      // Check User model
      const userModel = outputs.find(o => o.path.endsWith('User.php') && !o.path.includes('BaseModel'));
      expect(userModel).toBeDefined();
      expect(userModel!.content).toContain('class User extends UserBaseModel');
    });

    it('generates authenticatable model for auth schemas', async () => {
      const plugin = laravelPlugin();
      const generator = plugin.generators![1];

      const schemas: SchemaCollection = {
        Admin: {
          name: 'Admin',
          kind: 'object',
          filePath: '/test/admin.yaml',
          relativePath: '/test/admin.yaml',
          properties: {
            email: { type: 'Email' },
            password: { type: 'Password' },
          },
          options: {
            authenticatable: true,
            timestamps: true,
          },
        },
      };

      const outputs = await generator.generate(createContext(schemas));

      const adminBaseModel = outputs.find(o => o.path.includes('AdminBaseModel.php'));
      expect(adminBaseModel).toBeDefined();
      expect(adminBaseModel!.content).toContain('extends Authenticatable');
      expect(adminBaseModel!.content).toContain('use Notifiable');
    });

    it('uses custom model paths', async () => {
      const plugin = laravelPlugin({
        modelsPath: 'src/Models',
        baseModelsPath: 'src/Models/OmnifyBase',
      });
      const generator = plugin.generators![1];

      const schemas: SchemaCollection = {
        Post: {
          name: 'Post',
          kind: 'object',
          filePath: '/test/post.yaml',
          relativePath: '/test/post.yaml',
          properties: {
            title: { type: 'String' },
          },
        },
      };

      const outputs = await generator.generate(createContext(schemas));

      const baseModel = outputs.find(o => o.path.includes('Generated/BaseModel.php'));
      expect(baseModel).toBeDefined();

      const postModel = outputs.find(o => o.path.endsWith('src/Models/Post.php'));
      expect(postModel).toBeDefined();
    });

    it('generates relation methods', async () => {
      const plugin = laravelPlugin();
      const generator = plugin.generators![1];

      const schemas: SchemaCollection = {
        Post: {
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
            },
            comments: {
              type: 'Association',
              relation: 'OneToMany',
              target: 'Comment',
            },
          },
        },
        User: {
          name: 'User',
          kind: 'object',
          filePath: '/test/user.yaml',
          relativePath: '/test/user.yaml',
          properties: {},
        },
        Comment: {
          name: 'Comment',
          kind: 'object',
          filePath: '/test/comment.yaml',
          relativePath: '/test/comment.yaml',
          properties: {},
        },
      };

      const outputs = await generator.generate(createContext(schemas));

      const postBaseModel = outputs.find(o => o.path.includes('PostBaseModel.php'));
      expect(postBaseModel).toBeDefined();
      expect(postBaseModel!.content).toContain('public function author(): BelongsTo');
      expect(postBaseModel!.content).toContain('public function comments(): HasMany');
    });

    it('skips enum schemas', async () => {
      const plugin = laravelPlugin();
      const generator = plugin.generators![1];

      const schemas: SchemaCollection = {
        Status: {
          name: 'Status',
          kind: 'enum',
          filePath: '/test/status.yaml',
          relativePath: '/test/status.yaml',
          properties: {},
          values: ['active', 'inactive'],
        },
      };

      const outputs = await generator.generate(createContext(schemas));

      // Should only generate BaseModel (no entity models for enums)
      // Check that no StatusBaseModel or Status model is generated
      const statusModels = outputs.filter(o =>
        o.path.includes('Status') && !o.path.includes('BaseModel.php')
      );
      expect(statusModels).toHaveLength(0);

      // BaseModel.php should exist
      const baseModel = outputs.find(o => o.path.endsWith('BaseModel.php'));
      expect(baseModel).toBeDefined();
    });
  });

  describe('laravel-migrations generator with ctx.changes', () => {
    describe('added schemas (CREATE migrations)', () => {
      it('generates CREATE migration for added schema', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          Product: {
            name: 'Product',
            kind: 'object',
            filePath: '/test/product.yaml',
            relativePath: '/test/product.yaml',
            properties: {
              name: { type: 'String' },
              price: { type: 'Decimal', precision: 10, scale: 2 },
            },
          },
        };

        const changes: SchemaChange[] = [
          {
            schemaName: 'Product',
            changeType: 'added',
          },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(1);
        expect(outputs[0].path).toContain('create_products_table.php');
        expect(outputs[0].content).toContain("Schema::create('products'");
        expect(outputs[0].metadata?.migrationType).toBe('create');
      });

      it('generates multiple CREATE migrations for multiple added schemas', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          Product: {
            name: 'Product',
            kind: 'object',
            filePath: '/test/product.yaml',
            relativePath: '/test/product.yaml',
            properties: { name: { type: 'String' } },
          },
          Category: {
            name: 'Category',
            kind: 'object',
            filePath: '/test/category.yaml',
            relativePath: '/test/category.yaml',
            properties: { title: { type: 'String' } },
          },
        };

        const changes: SchemaChange[] = [
          { schemaName: 'Product', changeType: 'added' },
          { schemaName: 'Category', changeType: 'added' },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(2);
        expect(outputs.some(o => o.path.includes('create_products_table.php'))).toBe(true);
        expect(outputs.some(o => o.path.includes('create_categories_table.php'))).toBe(true);
      });

      it('skips enum schemas in changes', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          Status: {
            name: 'Status',
            kind: 'enum',
            filePath: '/test/status.yaml',
            relativePath: '/test/status.yaml',
            properties: {},
            values: ['active', 'inactive'],
          },
        };

        const changes: SchemaChange[] = [
          { schemaName: 'Status', changeType: 'added' },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        // Enums don't generate migrations
        expect(outputs).toHaveLength(0);
      });
    });

    describe('modified schemas (ALTER migrations)', () => {
      it('generates ALTER migration for added column', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          User: {
            name: 'User',
            kind: 'object',
            filePath: '/test/user.yaml',
            relativePath: '/test/user.yaml',
            properties: {
              name: { type: 'String' },
              email: { type: 'String' },
              phone: { type: 'String', nullable: true }, // newly added
            },
          },
        };

        const changes: SchemaChange[] = [
          {
            schemaName: 'User',
            changeType: 'modified',
            columnChanges: [
              {
                column: 'phone',
                changeType: 'added',
                currentDef: { type: 'String', nullable: true },
              },
            ],
          },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(1);
        expect(outputs[0].path).toContain('update_users_table.php');
        expect(outputs[0].content).toContain("$table->string('phone')");
        expect(outputs[0].content).toContain('->nullable()');
        expect(outputs[0].metadata?.migrationType).toBe('alter');
      });

      it('generates ALTER migration for removed column', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          User: {
            name: 'User',
            kind: 'object',
            filePath: '/test/user.yaml',
            relativePath: '/test/user.yaml',
            properties: {
              name: { type: 'String' },
              email: { type: 'String' },
            },
          },
        };

        const changes: SchemaChange[] = [
          {
            schemaName: 'User',
            changeType: 'modified',
            columnChanges: [
              {
                column: 'phone',
                changeType: 'removed',
                previousDef: { type: 'String', nullable: true },
              },
            ],
          },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(1);
        expect(outputs[0].path).toContain('update_users_table.php');
        expect(outputs[0].content).toContain("dropColumn('phone')");
        expect(outputs[0].metadata?.migrationType).toBe('alter');
      });

      it('generates ALTER migration for multiple column changes', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          Post: {
            name: 'Post',
            kind: 'object',
            filePath: '/test/post.yaml',
            relativePath: '/test/post.yaml',
            properties: {
              title: { type: 'String' },
              content: { type: 'Text' },
              subtitle: { type: 'String', nullable: true },
            },
          },
        };

        const changes: SchemaChange[] = [
          {
            schemaName: 'Post',
            changeType: 'modified',
            columnChanges: [
              {
                column: 'subtitle',
                changeType: 'added',
                currentDef: { type: 'String', nullable: true },
              },
              {
                column: 'excerpt',
                changeType: 'removed',
                previousDef: { type: 'Text', nullable: true },
              },
            ],
          },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(1);
        expect(outputs[0].content).toContain("$table->string('subtitle')");
        expect(outputs[0].content).toContain("dropColumn('excerpt')");
      });

      it('generates ALTER migration for option changes (softDelete)', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          Article: {
            name: 'Article',
            kind: 'object',
            filePath: '/test/article.yaml',
            relativePath: '/test/article.yaml',
            properties: {
              title: { type: 'String' },
            },
            options: { softDelete: true },
          },
        };

        const changes: SchemaChange[] = [
          {
            schemaName: 'Article',
            changeType: 'modified',
            optionChanges: {
              softDelete: { from: false, to: true },
            },
          },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(1);
        expect(outputs[0].content).toContain('softDeletes');
      });
    });

    describe('removed schemas (DROP migrations)', () => {
      it('generates DROP migration for removed schema', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        // Schema was removed, so it's not in schemas collection
        const schemas: SchemaCollection = {};

        const changes: SchemaChange[] = [
          {
            schemaName: 'OldTable',
            changeType: 'removed',
          },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(1);
        expect(outputs[0].path).toContain('drop_old_tables_table.php');
        expect(outputs[0].content).toContain("Schema::dropIfExists('old_tables')");
        expect(outputs[0].metadata?.migrationType).toBe('drop');
      });

      it('generates DROP migration for multiple removed schemas', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {};

        const changes: SchemaChange[] = [
          { schemaName: 'OldTable', changeType: 'removed' },
          { schemaName: 'DeprecatedModel', changeType: 'removed' },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(2);
        expect(outputs.some(o => o.path.includes('drop_old_tables_table.php'))).toBe(true);
        expect(outputs.some(o => o.path.includes('drop_deprecated_models_table.php'))).toBe(true);
      });
    });

    describe('mixed changes', () => {
      it('handles added, modified, and removed schemas together', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          NewModel: {
            name: 'NewModel',
            kind: 'object',
            filePath: '/test/new.yaml',
            relativePath: '/test/new.yaml',
            properties: { name: { type: 'String' } },
          },
          ModifiedModel: {
            name: 'ModifiedModel',
            kind: 'object',
            filePath: '/test/modified.yaml',
            relativePath: '/test/modified.yaml',
            properties: {
              title: { type: 'String' },
              newField: { type: 'Int' },
            },
          },
        };

        const changes: SchemaChange[] = [
          { schemaName: 'NewModel', changeType: 'added' },
          {
            schemaName: 'ModifiedModel',
            changeType: 'modified',
            columnChanges: [
              { column: 'newField', changeType: 'added', currentDef: { type: 'Int' } },
            ],
          },
          { schemaName: 'DeletedModel', changeType: 'removed' },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(3);

        // CREATE for new model
        const createOutput = outputs.find(o => o.path.includes('create_new_models_table.php'));
        expect(createOutput).toBeDefined();
        expect(createOutput!.metadata?.migrationType).toBe('create');

        // ALTER for modified model
        const alterOutput = outputs.find(o => o.path.includes('update_modified_models_table.php'));
        expect(alterOutput).toBeDefined();
        expect(alterOutput!.metadata?.migrationType).toBe('alter');

        // DROP for deleted model
        const dropOutput = outputs.find(o => o.path.includes('drop_deleted_models_table.php'));
        expect(dropOutput).toBeDefined();
        expect(dropOutput!.metadata?.migrationType).toBe('drop');
      });

      it('ignores schemas not in changes array', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          ExistingModel: {
            name: 'ExistingModel',
            kind: 'object',
            filePath: '/test/existing.yaml',
            relativePath: '/test/existing.yaml',
            properties: { name: { type: 'String' } },
          },
          NewModel: {
            name: 'NewModel',
            kind: 'object',
            filePath: '/test/new.yaml',
            relativePath: '/test/new.yaml',
            properties: { title: { type: 'String' } },
          },
        };

        // Only NewModel is in changes (added)
        const changes: SchemaChange[] = [
          { schemaName: 'NewModel', changeType: 'added' },
        ];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        // Only NewModel should get a migration
        expect(outputs).toHaveLength(1);
        expect(outputs[0].path).toContain('create_new_models_table.php');
      });
    });

    describe('empty changes array', () => {
      it('generates no migrations when changes is empty array', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          User: {
            name: 'User',
            kind: 'object',
            filePath: '/test/user.yaml',
            relativePath: '/test/user.yaml',
            properties: { name: { type: 'String' } },
          },
        };

        const changes: SchemaChange[] = [];

        const ctx = createContext(schemas, changes);
        const outputs = await generator.generate(ctx);

        // Empty changes = no migrations needed
        expect(outputs).toHaveLength(0);
      });
    });

    describe('undefined changes (fallback behavior)', () => {
      it('generates CREATE migrations for all schemas when changes is undefined', async () => {
        const plugin = laravelPlugin();
        const generator = plugin.generators![0];

        const schemas: SchemaCollection = {
          User: {
            name: 'User',
            kind: 'object',
            filePath: '/test/user.yaml',
            relativePath: '/test/user.yaml',
            properties: { name: { type: 'String' } },
          },
          Post: {
            name: 'Post',
            kind: 'object',
            filePath: '/test/post.yaml',
            relativePath: '/test/post.yaml',
            properties: { title: { type: 'String' } },
          },
        };

        // No changes parameter (undefined) - fallback to generating all
        const ctx = createContext(schemas);
        const outputs = await generator.generate(ctx);

        expect(outputs).toHaveLength(2);
        expect(outputs.every(o => o.metadata?.migrationType === 'create')).toBe(true);
        expect(outputs.some(o => o.path.includes('create_users_table.php'))).toBe(true);
        expect(outputs.some(o => o.path.includes('create_posts_table.php'))).toBe(true);
      });
    });
  });
});
