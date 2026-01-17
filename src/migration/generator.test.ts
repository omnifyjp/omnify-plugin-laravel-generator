/**
 * @famgia/omnify-laravel - Migration Generator Tests
 *
 * Tests for generateMigrations function, specifically:
 * - Timestamp consistency (all migrations use same base timestamp)
 * - FK dependency ordering
 * - Timestamp increments are correct
 */

import { describe, it, expect } from 'vitest';
import { generateMigrations } from './generator.js';
import type { SchemaCollection } from '@famgia/omnify-types';

/**
 * Helper to extract timestamp from migration filename
 * Format: YYYY_MM_DD_HHMMSS_action_tablename_table.php
 */
function extractTimestamp(fileName: string): string {
    const match = fileName.match(/^(\d{4}_\d{2}_\d{2}_\d{6})_/);
    return match ? match[1] : '';
}

/**
 * Helper to parse timestamp into components for comparison
 */
function parseTimestamp(timestamp: string): {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
} {
    const parts = timestamp.split('_');
    const timePart = parts[3] ?? '000000';
    return {
        year: parseInt(parts[0] ?? '0', 10),
        month: parseInt(parts[1] ?? '0', 10),
        day: parseInt(parts[2] ?? '0', 10),
        hours: parseInt(timePart.substring(0, 2), 10),
        minutes: parseInt(timePart.substring(2, 4), 10),
        seconds: parseInt(timePart.substring(4, 6), 10),
    };
}

/**
 * Helper to convert timestamp to total seconds for comparison
 */
function timestampToSeconds(timestamp: string): number {
    const t = parseTimestamp(timestamp);
    return (
        t.year * 31536000 + // approximate year in seconds
        t.month * 2592000 + // approximate month in seconds
        t.day * 86400 +
        t.hours * 3600 +
        t.minutes * 60 +
        t.seconds
    );
}

describe('generateMigrations - Timestamp Consistency', () => {
    it('all migrations should use the same base timestamp when no timestamp option provided', () => {
        const schemas: SchemaCollection = {
            User: {
                name: 'User',
                kind: 'object',
                filePath: '/schemas/User.yaml',
                relativePath: '/schemas/User.yaml',
                properties: {
                    name: { type: 'String' },
                    email: { type: 'Email' },
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
                    },
                },
            },
            Comment: {
                name: 'Comment',
                kind: 'object',
                filePath: '/schemas/Comment.yaml',
                relativePath: '/schemas/Comment.yaml',
                properties: {
                    content: { type: 'Text' },
                    post: {
                        type: 'Association',
                        relation: 'ManyToOne',
                        target: 'Post',
                    },
                },
            },
        };

        // Generate without passing timestamp - this is the bug scenario
        const migrations = generateMigrations(schemas);

        expect(migrations.length).toBeGreaterThanOrEqual(3);

        // Extract all timestamps
        const timestamps = migrations.map(m => extractTimestamp(m.fileName));

        // All timestamps should have the same base (year, month, day, hour, minute)
        // Only seconds should differ
        const baseTimestamps = timestamps.map(ts => {
            const parts = ts.split('_');
            // Return everything except seconds: YYYY_MM_DD_HHMM
            return `${parts[0]}_${parts[1]}_${parts[2]}_${(parts[3] ?? '').substring(0, 4)}`;
        });

        // All base timestamps should be identical
        const uniqueBaseTimes = [...new Set(baseTimestamps)];
        expect(uniqueBaseTimes).toHaveLength(1);
    });

    it('timestamps should increment by 1 second for each subsequent migration', () => {
        const schemas: SchemaCollection = {
            A: {
                name: 'A',
                kind: 'object',
                filePath: '/schemas/A.yaml',
                relativePath: '/schemas/A.yaml',
                properties: { name: { type: 'String' } },
            },
            B: {
                name: 'B',
                kind: 'object',
                filePath: '/schemas/B.yaml',
                relativePath: '/schemas/B.yaml',
                properties: {
                    a: { type: 'Association', relation: 'ManyToOne', target: 'A' },
                },
            },
            C: {
                name: 'C',
                kind: 'object',
                filePath: '/schemas/C.yaml',
                relativePath: '/schemas/C.yaml',
                properties: {
                    b: { type: 'Association', relation: 'ManyToOne', target: 'B' },
                },
            },
        };

        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_120000' });

        expect(migrations).toHaveLength(3);

        const timestamps = migrations.map(m => extractTimestamp(m.fileName));
        expect(timestamps[0]).toBe('2024_01_01_120000');
        expect(timestamps[1]).toBe('2024_01_01_120001');
        expect(timestamps[2]).toBe('2024_01_01_120002');
    });

  it('timestamps should maintain order even with many schemas', () => {
    // Create 10 schemas in a chain: S1 -> S2 -> S3 -> ... -> S10
    const schemaBuilder: Record<string, SchemaCollection[string]> = {};
    for (let i = 1; i <= 10; i++) {
      schemaBuilder[`Schema${i}`] = {
        name: `Schema${i}`,
        kind: 'object',
        filePath: `/schemas/Schema${i}.yaml`,
        relativePath: `/schemas/Schema${i}.yaml`,
        properties:
          i === 1
            ? { name: { type: 'String' } }
            : {
                parent: {
                  type: 'Association',
                  relation: 'ManyToOne',
                  target: `Schema${i - 1}`,
                },
              },
      };
    }
    const schemas = schemaBuilder as SchemaCollection;

    const migrations = generateMigrations(schemas);

        expect(migrations).toHaveLength(10);

        // All timestamps should be in increasing order
        const seconds = migrations.map(m => {
            const ts = extractTimestamp(m.fileName);
            return timestampToSeconds(ts);
        });

        for (let i = 1; i < seconds.length; i++) {
            expect(seconds[i]).toBeGreaterThan(seconds[i - 1]!);
        }
    });
});

describe('generateMigrations - FK Dependency Ordering', () => {
    it('tables with FK dependencies should come AFTER their referenced tables', () => {
        const schemas: SchemaCollection = {
            // Alphabetically first, but depends on Organization
            Admin: {
                name: 'Admin',
                kind: 'object',
                filePath: '/schemas/Admin.yaml',
                relativePath: '/schemas/Admin.yaml',
                properties: {
                    name: { type: 'String' },
                },
            },
            // Depends on Organization (should come after)
            Subscription: {
                name: 'Subscription',
                kind: 'object',
                filePath: '/schemas/Subscription.yaml',
                relativePath: '/schemas/Subscription.yaml',
                properties: {
                    organization: {
                        type: 'Association',
                        relation: 'ManyToOne',
                        target: 'Organization',
                    },
                    plan: { type: 'String' },
                },
            },
            // Referenced by Subscription (should come before)
            Organization: {
                name: 'Organization',
                kind: 'object',
                filePath: '/schemas/Organization.yaml',
                relativePath: '/schemas/Organization.yaml',
                properties: {
                    name: { type: 'String' },
                },
            },
        };

        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

        const tableOrder = migrations.map(m => m.tables[0]);
        const orgIndex = tableOrder.indexOf('organizations');
        const subIndex = tableOrder.indexOf('subscriptions');

        // Organization MUST come before Subscription
        expect(orgIndex).toBeLessThan(subIndex);

        // Verify timestamps also reflect this order
        const orgTimestamp = extractTimestamp(migrations[orgIndex]!.fileName);
        const subTimestamp = extractTimestamp(migrations[subIndex]!.fileName);

        expect(timestampToSeconds(orgTimestamp)).toBeLessThan(timestampToSeconds(subTimestamp));
    });

    it('complex dependency chain: A <- B <- C <- D should order correctly', () => {
        const schemas: SchemaCollection = {
            // Define in reverse order to test sorting
            D: {
                name: 'D',
                kind: 'object',
                filePath: '/schemas/D.yaml',
                relativePath: '/schemas/D.yaml',
                properties: {
                    c: { type: 'Association', relation: 'ManyToOne', target: 'C' },
                },
            },
            C: {
                name: 'C',
                kind: 'object',
                filePath: '/schemas/C.yaml',
                relativePath: '/schemas/C.yaml',
                properties: {
                    b: { type: 'Association', relation: 'ManyToOne', target: 'B' },
                },
            },
            B: {
                name: 'B',
                kind: 'object',
                filePath: '/schemas/B.yaml',
                relativePath: '/schemas/B.yaml',
                properties: {
                    a: { type: 'Association', relation: 'ManyToOne', target: 'A' },
                },
            },
            A: {
                name: 'A',
                kind: 'object',
                filePath: '/schemas/A.yaml',
                relativePath: '/schemas/A.yaml',
                properties: {
                    name: { type: 'String' },
                },
            },
        };

        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

        const tableOrder = migrations.map(m => m.tables[0]);

        // Should be ordered: A, B, C, D (topological order)
        expect(tableOrder.indexOf('as')).toBeLessThan(tableOrder.indexOf('bs'));
        expect(tableOrder.indexOf('bs')).toBeLessThan(tableOrder.indexOf('cs'));
        expect(tableOrder.indexOf('cs')).toBeLessThan(tableOrder.indexOf('ds'));
    });

    it('multiple independent branches should not affect ordering of dependent tables', () => {
        const schemas: SchemaCollection = {
            // Independent table
            Category: {
                name: 'Category',
                kind: 'object',
                filePath: '/schemas/Category.yaml',
                relativePath: '/schemas/Category.yaml',
                properties: { name: { type: 'String' } },
            },
            // Independent table
            User: {
                name: 'User',
                kind: 'object',
                filePath: '/schemas/User.yaml',
                relativePath: '/schemas/User.yaml',
                properties: { name: { type: 'String' } },
            },
            // Depends on BOTH Category and User
            Post: {
                name: 'Post',
                kind: 'object',
                filePath: '/schemas/Post.yaml',
                relativePath: '/schemas/Post.yaml',
                properties: {
                    category: { type: 'Association', relation: 'ManyToOne', target: 'Category' },
                    author: { type: 'Association', relation: 'ManyToOne', target: 'User' },
                },
            },
        };

        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

        const tableOrder = migrations.map(m => m.tables[0]);
        const categoryIdx = tableOrder.indexOf('categories');
        const userIdx = tableOrder.indexOf('users');
        const postIdx = tableOrder.indexOf('posts');

        // Post should come AFTER both Category and User
        expect(postIdx).toBeGreaterThan(categoryIdx);
        expect(postIdx).toBeGreaterThan(userIdx);
    });
});

describe('generateMigrations - Pivot Tables', () => {
    it('pivot tables should come after their referenced tables', () => {
        const schemas: SchemaCollection = {
            Post: {
                name: 'Post',
                kind: 'object',
                filePath: '/schemas/Post.yaml',
                relativePath: '/schemas/Post.yaml',
                properties: {
                    title: { type: 'String' },
                    tags: {
                        type: 'Association',
                        relation: 'ManyToMany',
                        target: 'Tag',
                    },
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

        // Pivot table (post_tag) should exist and come after both Post and Tag
        expect(tableOrder).toContain('post_tag');

        const postIdx = tableOrder.indexOf('posts');
        const tagIdx = tableOrder.indexOf('tags');
        const pivotIdx = tableOrder.indexOf('post_tag');

        expect(pivotIdx).toBeGreaterThan(postIdx);
        expect(pivotIdx).toBeGreaterThan(tagIdx);
    });

    it('pivot table timestamps should continue incrementing from main tables', () => {
        const schemas: SchemaCollection = {
            Post: {
                name: 'Post',
                kind: 'object',
                filePath: '/schemas/Post.yaml',
                relativePath: '/schemas/Post.yaml',
                properties: {
                    title: { type: 'String' },
                    tags: {
                        type: 'Association',
                        relation: 'ManyToMany',
                        target: 'Tag',
                    },
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

        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_120000' });

        // Should have Post, Tag, and pivot table
        expect(migrations).toHaveLength(3);

        const timestamps = migrations.map(m => extractTimestamp(m.fileName));

        // All timestamps should increment sequentially
        expect(timestamps).toContain('2024_01_01_120000');
        expect(timestamps).toContain('2024_01_01_120001');
        expect(timestamps).toContain('2024_01_01_120002');
    });
});

describe('generateMigrations - Edge Cases', () => {
    it('self-referencing table (like tree structure) should not cause infinite loop', () => {
        const schemas: SchemaCollection = {
            Category: {
                name: 'Category',
                kind: 'object',
                filePath: '/schemas/Category.yaml',
                relativePath: '/schemas/Category.yaml',
                properties: {
                    name: { type: 'String' },
                    parent: {
                        type: 'Association',
                        relation: 'ManyToOne',
                        target: 'Category',
                        nullable: true,
                    },
                },
            },
        };

        // Should not throw or hang
        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

        expect(migrations).toHaveLength(1);
        expect(migrations[0]!.tables[0]).toBe('categories');
    });

    it('circular dependency should be handled gracefully', () => {
        const schemas: SchemaCollection = {
            A: {
                name: 'A',
                kind: 'object',
                filePath: '/schemas/A.yaml',
                relativePath: '/schemas/A.yaml',
                properties: {
                    b: { type: 'Association', relation: 'ManyToOne', target: 'B', nullable: true },
                },
            },
            B: {
                name: 'B',
                kind: 'object',
                filePath: '/schemas/B.yaml',
                relativePath: '/schemas/B.yaml',
                properties: {
                    a: { type: 'Association', relation: 'ManyToOne', target: 'A', nullable: true },
                },
            },
        };

        // Should not throw or hang
        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

        expect(migrations).toHaveLength(2);
    });

    it('empty schema collection should return empty migrations', () => {
        const schemas: SchemaCollection = {};

        const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

        expect(migrations).toHaveLength(0);
    });

  it('schema with only enums should not generate table migrations', () => {
    const schemas: SchemaCollection = {
      Status: {
        name: 'Status',
        kind: 'enum',
        filePath: '/schemas/Status.yaml',
        relativePath: '/schemas/Status.yaml',
        properties: {},
        values: ['draft', 'published', 'archived'],
      },
    };

    const migrations = generateMigrations(schemas, { timestamp: '2024_01_01_000000' });

    expect(migrations).toHaveLength(0);
  });
});
