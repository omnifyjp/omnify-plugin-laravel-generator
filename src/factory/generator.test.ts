/**
 * @famgia/omnify-laravel - Factory Generator Tests
 */

import { describe, it, expect } from 'vitest';
import { generateFactories, type GeneratedFactory } from './generator.js';
import type { SchemaCollection, LoadedSchema } from '@famgia/omnify-types';

describe('Factory Generator', () => {
  const createSchema = (name: string, properties: LoadedSchema['properties'], options: Partial<LoadedSchema> = {}): LoadedSchema => ({
    name,
    kind: 'object',
    filePath: `/schemas/${name}.yaml`,
    relativePath: `schemas/${name}.yaml`,
    properties,
    ...options,
  });

  describe('generateFactories', () => {
    it('generates factory for simple schema', () => {
      const schemas: SchemaCollection = {
        User: createSchema('User', {
          name: { type: 'String' },
          email: { type: 'Email' },
          age: { type: 'Int' },
        }),
      };

      const factories = generateFactories(schemas);
      expect(factories).toHaveLength(1);
      expect(factories[0].name).toBe('UserFactory');
      expect(factories[0].schemaName).toBe('User');
      expect(factories[0].path).toBe('database/factories/UserFactory.php');
      expect(factories[0].overwrite).toBe(false);
    });

    it('generates correct fake data for String fields', () => {
      const schemas: SchemaCollection = {
        Post: createSchema('Post', {
          title: { type: 'String' },
          slug: { type: 'String' },
          name: { type: 'String' },
        }),
      };

      const factories = generateFactories(schemas);
      const content = factories[0].content;

      expect(content).toContain("'title' => fake()->sentence(3),");
      expect(content).toContain("'slug' => fake()->unique()->slug(2),");
      expect(content).toContain("'name' => fake()->sentence(3),");
    });

    it('generates correct fake data for Email and Password', () => {
      const schemas: SchemaCollection = {
        User: createSchema('User', {
          email: { type: 'Email' },
          password: { type: 'Password' },
        }),
      };

      const factories = generateFactories(schemas);
      const content = factories[0].content;

      expect(content).toContain("'email' => fake()->unique()->safeEmail(),");
      expect(content).toContain("'password' => bcrypt('password'),");
    });

    it('generates correct fake data for Text types', () => {
      const schemas: SchemaCollection = {
        Post: createSchema('Post', {
          excerpt: { type: 'Text' },
          content: { type: 'LongText' },
        }),
      };

      const factories = generateFactories(schemas);
      const content = factories[0].content;

      expect(content).toContain("'excerpt' => fake()->paragraphs(3, true),");
      expect(content).toContain("'content' => fake()->paragraphs(5, true),");
    });

    it('generates correct fake data for Date/Time types', () => {
      const schemas: SchemaCollection = {
        Event: createSchema('Event', {
          event_date: { type: 'Date' },
          start_time: { type: 'Time' },
          starts_at: { type: 'DateTime' },
        }),
      };

      const factories = generateFactories(schemas);
      const content = factories[0].content;

      expect(content).toContain("'event_date' => fake()->date(),");
      expect(content).toContain("'start_time' => fake()->time(),");
      expect(content).toContain("'starts_at' => fake()->dateTime(),");
    });

    it('generates correct fake data for Enum type', () => {
      const schemas: SchemaCollection = {
        Post: createSchema('Post', {
          status: {
            type: 'Enum',
            enum: ['draft', 'published', 'archived']
          },
        }),
      };

      const factories = generateFactories(schemas);
      const content = factories[0].content;

      expect(content).toContain("'status' => fake()->randomElement(['draft', 'published', 'archived']),");
    });

    it('generates correct fake data for EnumRef type', () => {
      const schemas: SchemaCollection = {
        PostStatus: {
          name: 'PostStatus',
          kind: 'enum',
          filePath: '/schemas/PostStatus.yaml',
          relativePath: 'schemas/PostStatus.yaml',
          values: ['draft', 'pending', 'published'],
        },
        Post: createSchema('Post', {
          status: {
            type: 'EnumRef',
            enum: 'PostStatus'
          },
        }),
      };

      const factories = generateFactories(schemas);
      // Should only generate factory for Post, not for enum
      expect(factories).toHaveLength(1);
      expect(factories[0].name).toBe('PostFactory');

      const content = factories[0].content;
      expect(content).toContain("'status' => fake()->randomElement(['draft', 'pending', 'published']),");
    });

    it('generates correct fake data for associations (foreign keys)', () => {
      const schemas: SchemaCollection = {
        User: createSchema('User', {
          name: { type: 'String' },
        }),
        Post: createSchema('Post', {
          title: { type: 'String' },
          author: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'User'
          },
        }),
      };

      const factories = generateFactories(schemas);
      const postFactory = factories.find(f => f.name === 'PostFactory')!;
      const content = postFactory.content;

      expect(content).toContain("use App\\Models\\User;");
      expect(content).toContain("'author_id' => User::query()->inRandomOrder()->first()?->id ?? User::factory()->create()->id,");
    });

    it('handles nullable associations', () => {
      const schemas: SchemaCollection = {
        Category: createSchema('Category', {
          name: { type: 'String' },
        }),
        Post: createSchema('Post', {
          title: { type: 'String' },
          category: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Category',
            nullable: true,
          },
        }),
      };

      const factories = generateFactories(schemas);
      const postFactory = factories.find(f => f.name === 'PostFactory')!;
      const content = postFactory.content;

      // Nullable associations use simpler pattern
      expect(content).toContain("'category_id' => Category::query()->inRandomOrder()->first()?->id,");
    });

    it('skips system fields', () => {
      const schemas: SchemaCollection = {
        Post: createSchema('Post', {
          title: { type: 'String' },
          created_at: { type: 'Timestamp' },
          updated_at: { type: 'Timestamp' },
          deleted_at: { type: 'Timestamp' },
        }),
      };

      const factories = generateFactories(schemas);
      const content = factories[0].content;

      expect(content).toContain("'title' => fake()->sentence(3),");
      expect(content).not.toContain("'created_at'");
      expect(content).not.toContain("'updated_at'");
      expect(content).not.toContain("'deleted_at'");
    });

    it('uses custom factory path', () => {
      const schemas: SchemaCollection = {
        User: createSchema('User', {
          name: { type: 'String' },
        }),
      };

      const factories = generateFactories(schemas, {
        factoryPath: 'custom/factories',
      });

      expect(factories[0].path).toBe('custom/factories/UserFactory.php');
    });

    it('uses custom model namespace', () => {
      const schemas: SchemaCollection = {
        User: createSchema('User', {
          name: { type: 'String' },
        }),
      };

      const factories = generateFactories(schemas, {
        modelNamespace: 'Domain\\Models',
      });

      const content = factories[0].content;
      expect(content).toContain('use Domain\\Models\\User;');
    });

    it('generates smart fake data based on field names', () => {
      const schemas: SchemaCollection = {
        User: createSchema('User', {
          phone_number: { type: 'String' },
          website_url: { type: 'String' },
          avatar_url: { type: 'String' },
          address: { type: 'String' },
          city: { type: 'String' },
          country: { type: 'String' },
          zip_code: { type: 'String' },
          color_hex: { type: 'String' },
          api_token: { type: 'String' },
          order_code: { type: 'String' },
        }),
      };

      const factories = generateFactories(schemas);
      const content = factories[0].content;

      expect(content).toContain("'phone_number' => fake()->phoneNumber(),");
      expect(content).toContain("'website_url' => fake()->url(),");
      expect(content).toContain("'avatar_url' => fake()->imageUrl(),");
      expect(content).toContain("'address' => fake()->address(),");
      expect(content).toContain("'city' => fake()->city(),");
      expect(content).toContain("'country' => fake()->country(),");
      expect(content).toContain("'zip_code' => fake()->postcode(),");
      expect(content).toContain("'color_hex' => fake()->hexColor(),");
      expect(content).toContain("'api_token' => \\Illuminate\\Support\\Str::random(32),");
      expect(content).toContain("'order_code' => fake()->unique()->regexify('[A-Z0-9]{8}'),");
    });
  });
});
