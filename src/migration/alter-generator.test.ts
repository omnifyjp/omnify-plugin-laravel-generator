/**
 * @famgia/omnify-laravel - ALTER Migration Generator Tests
 */

import { describe, it, expect } from 'vitest';
import type { SchemaChange, PropertySnapshot, IndexSnapshot } from '@famgia/omnify-atlas';
import {
  generateAlterMigration,
  generateDropTableMigration,
  generateMigrationsFromChanges,
} from './alter-generator.js';

describe('generateAlterMigration', () => {
  describe('column additions', () => {
    it('generates migration for added column', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        previousHash: 'oldhash',
        currentHash: 'newhash',
        columnChanges: [
          {
            column: 'email',
            changeType: 'added',
            currentDef: { type: 'Email', unique: true },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result).not.toBeNull();
      expect(result!.fileName).toBe('2024_01_01_120000_update_users_table.php');
      expect(result!.content).toContain("Schema::table('users'");
      expect(result!.content).toContain("$table->string('email')->unique();");
      expect(result!.content).toContain("$table->dropColumn('email');"); // down method
    });

    it('generates migration for nullable column', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'nickname',
            changeType: 'added',
            currentDef: { type: 'String', nullable: true },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->string('nickname')->nullable();");
    });

    it('generates migration for column with default', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'status',
            changeType: 'added',
            currentDef: { type: 'String', default: 'active' },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->string('status')->default('active');");
    });
  });

  describe('column removals', () => {
    it('generates migration for removed column', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'phone',
            changeType: 'removed',
            previousDef: { type: 'String' },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->dropColumn('phone');"); // up method
      expect(result!.content).toContain("$table->string('phone');"); // down method (restore)
    });
  });

  describe('column modifications', () => {
    it('generates migration for modified column type', () => {
      const change: SchemaChange = {
        schemaName: 'Post',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'content',
            changeType: 'modified',
            previousDef: { type: 'String' },
            currentDef: { type: 'Text' },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->text('content')->change();");
      // down should revert
      expect(result!.content).toContain("$table->string('content')->change();");
    });

    it('generates migration for modified nullable', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'bio',
            changeType: 'modified',
            previousDef: { type: 'String' },
            currentDef: { type: 'String', nullable: true },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->string('bio')->nullable()->change();");
    });
  });

  describe('index changes', () => {
    it('generates migration for added index', () => {
      const change: SchemaChange = {
        schemaName: 'Product',
        changeType: 'modified',
        indexChanges: [
          {
            changeType: 'added',
            index: { columns: ['sku'], unique: true },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->unique('sku');");
      expect(result!.content).toContain("$table->dropUnique('products_sku_unique');");
    });

    it('generates migration for added composite index', () => {
      const change: SchemaChange = {
        schemaName: 'Order',
        changeType: 'modified',
        indexChanges: [
          {
            changeType: 'added',
            index: { columns: ['userId', 'status'], unique: false },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->index(['user_id', 'status']);");
    });

    it('generates migration for removed index', () => {
      const change: SchemaChange = {
        schemaName: 'Product',
        changeType: 'modified',
        indexChanges: [
          {
            changeType: 'removed',
            index: { columns: ['sku'], unique: false },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->dropIndex('products_sku_index');");
      expect(result!.content).toContain("$table->index('sku');");
    });
  });

  describe('option changes', () => {
    it('generates migration for enabling timestamps', () => {
      const change: SchemaChange = {
        schemaName: 'Post',
        changeType: 'modified',
        optionChanges: {
          timestamps: { from: undefined, to: true },
        },
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain('$table->timestamps();');
      expect(result!.content).toContain('$table->dropTimestamps();');
    });

    it('generates migration for disabling timestamps', () => {
      const change: SchemaChange = {
        schemaName: 'Post',
        changeType: 'modified',
        optionChanges: {
          timestamps: { from: true, to: undefined },
        },
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain('$table->dropTimestamps();');
      // down should restore
      expect(result!.content).toContain('$table->timestamps();');
    });

    it('generates migration for enabling soft delete', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        optionChanges: {
          softDelete: { from: undefined, to: true },
        },
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain('$table->softDeletes();');
      expect(result!.content).toContain('$table->dropSoftDeletes();');
    });
  });

  describe('column renames', () => {
    it('generates migration for renamed column', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'fullName',
            changeType: 'renamed',
            previousColumn: 'name',
            previousDef: { type: 'String' },
            currentDef: { type: 'String' },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->renameColumn('name', 'full_name');");
      // down should reverse
      expect(result!.content).toContain("$table->renameColumn('full_name', 'name');");
    });

    it('generates migration for renamed column with modifications', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'fullName',
            changeType: 'renamed',
            previousColumn: 'name',
            previousDef: { type: 'String' },
            currentDef: { type: 'String', nullable: true },
            modifications: ['nullable'],
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      // Should have rename
      expect(result!.content).toContain("$table->renameColumn('name', 'full_name');");
      // Should also have modification
      expect(result!.content).toContain("$table->string('full_name')->nullable()->change();");
    });

    it('generates migration for multiple renames', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'fullName',
            changeType: 'renamed',
            previousColumn: 'name',
            previousDef: { type: 'String' },
            currentDef: { type: 'String' },
          },
          {
            column: 'emailAddress',
            changeType: 'renamed',
            previousColumn: 'email',
            previousDef: { type: 'Email' },
            currentDef: { type: 'Email' },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->renameColumn('name', 'full_name');");
      expect(result!.content).toContain("$table->renameColumn('email', 'email_address');");
    });

    it('handles camelCase to snake_case conversion in rename', () => {
      const change: SchemaChange = {
        schemaName: 'UserProfile',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'firstName',
            changeType: 'renamed',
            previousColumn: 'fName',
            previousDef: { type: 'String' },
            currentDef: { type: 'String' },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->renameColumn('f_name', 'first_name');");
    });

    it('generates migration for renamed column with type change', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'bio',
            changeType: 'renamed',
            previousColumn: 'description',
            previousDef: { type: 'String' },
            currentDef: { type: 'Text' }, // type change
            modifications: ['type'],
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      // Should have rename first
      expect(result!.content).toContain("$table->renameColumn('description', 'bio');");
      // Then type change
      expect(result!.content).toContain("$table->text('bio')->change();");
    });
  });

  describe('multiple changes', () => {
    it('generates migration with multiple column and index changes', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'email',
            changeType: 'added',
            currentDef: { type: 'Email' },
          },
          {
            column: 'phone',
            changeType: 'removed',
            previousDef: { type: 'String' },
          },
        ],
        indexChanges: [
          {
            changeType: 'added',
            index: { columns: ['email'], unique: true },
          },
        ],
        optionChanges: {
          timestamps: { from: undefined, to: true },
        },
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.content).toContain("$table->string('email');");
      expect(result!.content).toContain("$table->dropColumn('phone');");
      expect(result!.content).toContain("$table->unique('email');");
      expect(result!.content).toContain('$table->timestamps();');
    });
  });

  describe('edge cases', () => {
    it('returns null for non-modified change type', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'added',
        currentHash: 'hash',
      };

      const result = generateAlterMigration(change);

      expect(result).toBeNull();
    });

    it('returns null for modified change with no actual changes', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        previousHash: 'oldhash',
        currentHash: 'newhash',
        // No columnChanges, indexChanges, or optionChanges
      };

      const result = generateAlterMigration(change);

      expect(result).toBeNull();
    });

    it('handles camelCase to snake_case column conversion', () => {
      const change: SchemaChange = {
        schemaName: 'UserProfile',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'firstName',
            changeType: 'added',
            currentDef: { type: 'String' },
          },
        ],
      };

      const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

      expect(result!.fileName).toContain('user_profiles');
      expect(result!.content).toContain("$table->string('first_name');");
    });

    it('includes connection option when specified', () => {
      const change: SchemaChange = {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          {
            column: 'test',
            changeType: 'added',
            currentDef: { type: 'String' },
          },
        ],
      };

      const result = generateAlterMigration(change, {
        timestamp: '2024_01_01_120000',
        connection: 'pgsql',
      });

      expect(result!.content).toContain("protected $connection = 'pgsql';");
    });
  });
});

describe('generateDropTableMigration', () => {
  it('generates drop table migration', () => {
    const result = generateDropTableMigration('User', { timestamp: '2024_01_01_120000' });

    expect(result.fileName).toBe('2024_01_01_120000_drop_users_table.php');
    expect(result.content).toContain("Schema::dropIfExists('users');");
    expect(result.type).toBe('drop');
    expect(result.tables).toEqual(['users']);
  });

  it('handles PascalCase schema names', () => {
    const result = generateDropTableMigration('UserProfile', { timestamp: '2024_01_01_120000' });

    expect(result.fileName).toContain('user_profiles');
    expect(result.content).toContain("'user_profiles'");
  });

  it('includes connection option when specified', () => {
    const result = generateDropTableMigration('User', {
      timestamp: '2024_01_01_120000',
      connection: 'mysql',
    });

    expect(result.content).toContain("protected $connection = 'mysql';");
  });
});

describe('generateMigrationsFromChanges', () => {
  it('generates migrations for multiple changes', () => {
    const changes: SchemaChange[] = [
      {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          { column: 'email', changeType: 'added', currentDef: { type: 'Email' } },
        ],
      },
      {
        schemaName: 'Post',
        changeType: 'removed',
        previousHash: 'hash',
      },
    ];

    const result = generateMigrationsFromChanges(changes, { timestamp: '2024_01_01_120000' });

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('alter');
    expect(result[0].fileName).toContain('update_users');
    expect(result[1].type).toBe('drop');
    expect(result[1].fileName).toContain('drop_posts');
  });

  it('skips added schemas (handled by CREATE migration)', () => {
    const changes: SchemaChange[] = [
      {
        schemaName: 'NewTable',
        changeType: 'added',
        currentHash: 'hash',
      },
    ];

    const result = generateMigrationsFromChanges(changes);

    expect(result).toHaveLength(0);
  });

  it('generates unique timestamps for multiple migrations', () => {
    const changes: SchemaChange[] = [
      {
        schemaName: 'User',
        changeType: 'modified',
        columnChanges: [
          { column: 'a', changeType: 'added', currentDef: { type: 'String' } },
        ],
      },
      {
        schemaName: 'Post',
        changeType: 'modified',
        columnChanges: [
          { column: 'b', changeType: 'added', currentDef: { type: 'String' } },
        ],
      },
    ];

    const result = generateMigrationsFromChanges(changes, { timestamp: '2024_01_01_120000' });

    expect(result[0].fileName).toBe('2024_01_01_120000_update_users_table.php');
    expect(result[1].fileName).toBe('2024_01_01_120001_update_posts_table.php'); // seconds incremented
  });

  it('handles mixed change types', () => {
    const changes: SchemaChange[] = [
      { schemaName: 'New', changeType: 'added', currentHash: 'h1' },
      {
        schemaName: 'Modified',
        changeType: 'modified',
        columnChanges: [
          { column: 'x', changeType: 'added', currentDef: { type: 'String' } },
        ],
      },
      { schemaName: 'Deleted', changeType: 'removed', previousHash: 'h2' },
    ];

    const result = generateMigrationsFromChanges(changes, { timestamp: '2024_01_01_120000' });

    // Only modified and removed are handled
    expect(result).toHaveLength(2);
    expect(result.map(m => m.type)).toEqual(['alter', 'drop']);
  });
});

describe('type mappings', () => {
  const testTypeMapping = (omnifyType: string, laravelMethod: string) => {
    const change: SchemaChange = {
      schemaName: 'Test',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'testColumn',
          changeType: 'added',
          currentDef: { type: omnifyType },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });
    expect(result!.content).toContain(`$table->${laravelMethod}('test_column')`);
  };

  it('maps String to string', () => testTypeMapping('String', 'string'));
  it('maps Int to integer', () => testTypeMapping('Int', 'integer'));
  it('maps BigInt to bigInteger', () => testTypeMapping('BigInt', 'bigInteger'));
  it('maps Float to double', () => testTypeMapping('Float', 'double'));
  it('maps Boolean to boolean', () => testTypeMapping('Boolean', 'boolean'));
  it('maps Text to text', () => testTypeMapping('Text', 'text'));
  it('maps LongText to longText', () => testTypeMapping('LongText', 'longText'));
  it('maps Date to date', () => testTypeMapping('Date', 'date'));
  it('maps Time to time', () => testTypeMapping('Time', 'time'));
  it('maps Timestamp to timestamp', () => testTypeMapping('Timestamp', 'timestamp'));
  it('maps Json to json', () => testTypeMapping('Json', 'json'));
  it('maps Email to string', () => testTypeMapping('Email', 'string'));
  it('maps Password to string', () => testTypeMapping('Password', 'string'));
  it('maps File to string', () => testTypeMapping('File', 'string'));
  it('maps MultiFile to json', () => testTypeMapping('MultiFile', 'json'));
  it('maps Lookup to unsignedBigInteger', () => testTypeMapping('Lookup', 'unsignedBigInteger'));
});

describe('Association field support (FK columns)', () => {
  it('generates FK column and constraint for added ManyToOne association', () => {
    const change: SchemaChange = {
      schemaName: 'Post',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'category',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Category',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->unsignedBigInteger('category_id');");
    expect(result!.content).toContain("$table->foreign('category_id')->references('id')->on('categories');");
  });

  it('generates nullable FK column for nullable association', () => {
    const change: SchemaChange = {
      schemaName: 'Post',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'author',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'User',
            nullable: true,
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->unsignedBigInteger('author_id')->nullable();");
  });

  it('generates FK constraint with onDelete and onUpdate options', () => {
    const change: SchemaChange = {
      schemaName: 'Comment',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'post',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Post',
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->foreign('post_id')->references('id')->on('posts')->onDelete('CASCADE')->onUpdate('CASCADE');");
  });

  it('drops FK constraint before dropping column for removed association', () => {
    const change: SchemaChange = {
      schemaName: 'Post',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'category',
          changeType: 'removed',
          previousDef: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Category',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // upメソッドでFKを先にdropしてからcolumnをdrop
    expect(result!.content).toContain("$table->dropForeign(['category_id']);");
    expect(result!.content).toContain("$table->dropColumn('category_id');");

    // 順序確認: dropForeignがdropColumnの前
    const dropForeignIndex = result!.content.indexOf("dropForeign");
    const dropColumnIndex = result!.content.indexOf("dropColumn('category_id')");
    expect(dropForeignIndex).toBeLessThan(dropColumnIndex);
  });

  it('restores FK column and constraint in down method when adding association', () => {
    const change: SchemaChange = {
      schemaName: 'Post',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'category',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Category',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // downメソッドでもdropForeignとdropColumnが生成される
    const content = result!.content;
    const downSection = content.substring(content.indexOf('public function down'));
    expect(downSection).toContain("$table->dropForeign(['category_id']);");
    expect(downSection).toContain("$table->dropColumn('category_id');");
  });

  it('handles OneToOne association same as ManyToOne', () => {
    const change: SchemaChange = {
      schemaName: 'User',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'profile',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'OneToOne',
            target: 'UserProfile',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->unsignedBigInteger('profile_id');");
    expect(result!.content).toContain("$table->foreign('profile_id')->references('id')->on('user_profiles');");
  });

  it('does not create FK column for inverse side (mappedBy)', () => {
    const change: SchemaChange = {
      schemaName: 'User',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'posts',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'OneToMany',
            target: 'Post',
            mappedBy: 'author',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // OneToManyはFK columnを生成しない（inverse side）
    // 実際にはcolumnChangesがあるがAssociationではないので普通のstring扱い
    expect(result!.content).not.toContain("posts_id");
  });
});

describe('Decimal type support', () => {
  it('generates Decimal column with default precision/scale (8, 2)', () => {
    const change: SchemaChange = {
      schemaName: 'Product',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'price',
          changeType: 'added',
          currentDef: { type: 'Decimal' },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->decimal('price', 8, 2);");
  });

  it('generates Decimal column with custom precision/scale', () => {
    const change: SchemaChange = {
      schemaName: 'Product',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'weight',
          changeType: 'added',
          currentDef: { type: 'Decimal', precision: 10, scale: 4 },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->decimal('weight', 10, 4);");
  });

  it('generates Decimal column with nullable and default', () => {
    const change: SchemaChange = {
      schemaName: 'Product',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'discount',
          changeType: 'added',
          currentDef: { type: 'Decimal', precision: 5, scale: 2, nullable: true, default: 0 },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->decimal('discount', 5, 2)->nullable()->default(0);");
  });

  it('generates modify migration for Decimal precision/scale change', () => {
    const change: SchemaChange = {
      schemaName: 'Product',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'price',
          changeType: 'modified',
          previousDef: { type: 'Decimal', precision: 8, scale: 2 },
          currentDef: { type: 'Decimal', precision: 12, scale: 4 },
          modifications: ['precision', 'scale'],
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // up: change to new precision/scale
    expect(result!.content).toContain("$table->decimal('price', 12, 4)->change();");
    // down: revert to old precision/scale
    expect(result!.content).toContain("$table->decimal('price', 8, 2)->change();");
  });

  it('generates modify migration for type change to Decimal', () => {
    const change: SchemaChange = {
      schemaName: 'Product',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'price',
          changeType: 'modified',
          previousDef: { type: 'Float' },
          currentDef: { type: 'Decimal', precision: 10, scale: 2 },
          modifications: ['type'],
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->decimal('price', 10, 2)->change();");
    expect(result!.content).toContain("$table->double('price')->change();");
  });

  it('generates drop column that recreates Decimal with precision/scale in down', () => {
    const change: SchemaChange = {
      schemaName: 'Product',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'tax',
          changeType: 'removed',
          previousDef: { type: 'Decimal', precision: 6, scale: 3 },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->dropColumn('tax');");
    // down should recreate with precision/scale
    expect(result!.content).toContain("$table->decimal('tax', 6, 3);");
  });
});

describe('Enum type support', () => {
  it('generates enum column with values', () => {
    const change: SchemaChange = {
      schemaName: 'Post',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'status',
          changeType: 'added',
          currentDef: {
            type: 'Enum',
            enum: ['draft', 'published', 'archived'],
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // enumメソッドが呼ばれることを確認
    expect(result!.content).toContain("$table->enum('status')");
  });

  it('generates nullable enum with default value', () => {
    const change: SchemaChange = {
      schemaName: 'User',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'role',
          changeType: 'added',
          currentDef: {
            type: 'Enum',
            nullable: true,
            default: 'user',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("->nullable()");
    expect(result!.content).toContain("->default('user')");
  });

  it('handles enum removal and restoration in down', () => {
    const change: SchemaChange = {
      schemaName: 'Post',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'status',
          changeType: 'removed',
          previousDef: {
            type: 'Enum',
            enum: ['draft', 'published'],
            default: 'draft',
          },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // upでdrop
    expect(result!.content).toContain("$table->dropColumn('status')");
    // downで復元
    const downSection = result!.content.substring(result!.content.indexOf('public function down'));
    expect(downSection).toContain("$table->enum('status')");
    expect(downSection).toContain("->default('draft')");
  });
});

describe('Complex field scenarios', () => {
  it('handles adding multiple fields of different types in one migration', () => {
    const change: SchemaChange = {
      schemaName: 'Product',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'price',
          changeType: 'added',
          currentDef: { type: 'Decimal', precision: 10, scale: 2 },
        },
        {
          column: 'category',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Category',
            nullable: true,
          },
        },
        {
          column: 'status',
          changeType: 'added',
          currentDef: {
            type: 'Enum',
            default: 'active',
          },
        },
        {
          column: 'description',
          changeType: 'added',
          currentDef: { type: 'Text', nullable: true },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    expect(result!.content).toContain("$table->decimal('price', 10, 2);");
    expect(result!.content).toContain("$table->unsignedBigInteger('category_id')->nullable();");
    expect(result!.content).toContain("$table->foreign('category_id')");
    expect(result!.content).toContain("$table->enum('status')->default('active');");
    expect(result!.content).toContain("$table->text('description')->nullable();");
  });

  it('handles adding and removing fields in the same migration', () => {
    const change: SchemaChange = {
      schemaName: 'User',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'nickname',
          changeType: 'added',
          currentDef: { type: 'String', nullable: true },
        },
        {
          column: 'oldField',
          changeType: 'removed',
          previousDef: { type: 'String' },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // upメソッド
    expect(result!.content).toContain("$table->string('nickname')->nullable();");
    expect(result!.content).toContain("$table->dropColumn('old_field');");

    // downメソッド（反対の操作）
    const downSection = result!.content.substring(result!.content.indexOf('public function down'));
    expect(downSection).toContain("$table->dropColumn('nickname');");
    expect(downSection).toContain("$table->string('old_field');");
  });

  it('handles renaming and modifying field at the same time', () => {
    const change: SchemaChange = {
      schemaName: 'User',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'fullName',
          changeType: 'renamed',
          previousColumn: 'name',
          previousDef: { type: 'String' },
          currentDef: { type: 'String', nullable: true, default: 'Unknown' },
          modifications: ['nullable', 'default'],
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // まずrenameしてから
    expect(result!.content).toContain("$table->renameColumn('name', 'full_name');");
    // その後modify
    expect(result!.content).toContain("$table->string('full_name')->nullable()->default('Unknown')->change();");
  });

  it('generates correct order: add columns, add FK constraints, add indexes', () => {
    const change: SchemaChange = {
      schemaName: 'Order',
      changeType: 'modified',
      columnChanges: [
        {
          column: 'customer',
          changeType: 'added',
          currentDef: {
            type: 'Association',
            relation: 'ManyToOne',
            target: 'Customer',
          },
        },
        {
          column: 'total',
          changeType: 'added',
          currentDef: { type: 'Decimal', precision: 12, scale: 2 },
        },
      ],
      indexChanges: [
        {
          changeType: 'added',
          index: { columns: ['total'], unique: false },
        },
      ],
    };

    const result = generateAlterMigration(change, { timestamp: '2024_01_01_120000' });

    // カラム追加が先
    const columnAddIndex = result!.content.indexOf("unsignedBigInteger('customer_id')");
    const fkAddIndex = result!.content.indexOf("foreign('customer_id')");
    const totalAddIndex = result!.content.indexOf("decimal('total'");
    const indexAddIndex = result!.content.indexOf("index('total')");

    expect(columnAddIndex).toBeGreaterThan(-1);
    expect(fkAddIndex).toBeGreaterThan(columnAddIndex);
    expect(totalAddIndex).toBeGreaterThan(-1);
    expect(indexAddIndex).toBeGreaterThan(-1);
  });
});
