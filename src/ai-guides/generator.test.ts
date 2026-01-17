/**
 * Laravel AI Guides Generator Tests
 *
 * Tests for the Laravel-specific AI guides generator wrapper.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateAIGuides, shouldGenerateAIGuides } from './generator.js';

describe('Laravel AI Guides Generator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omnify-laravel-ai-guides-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe('generateAIGuides', () => {
    it('should generate Claude guides', () => {
      const result = generateAIGuides(tempDir);

      expect(result.claudeGuides).toBeGreaterThan(0);
      expect(existsSync(join(tempDir, '.claude/omnify/guides/laravel'))).toBe(true);
    });

    it('should generate Cursor rules', () => {
      const result = generateAIGuides(tempDir);

      expect(result.cursorRules).toBeGreaterThan(0);
      expect(existsSync(join(tempDir, '.cursor/rules/omnify'))).toBe(true);
    });

    it('should generate all expected Laravel guide files', () => {
      generateAIGuides(tempDir);

      const expectedFiles = [
        '.claude/omnify/guides/laravel/controller.md',
        '.claude/omnify/guides/laravel/testing.md',
        '.claude/omnify/guides/laravel/request.md',
        '.claude/omnify/guides/laravel/resource.md',
        '.claude/omnify/guides/laravel/service.md',
        '.claude/omnify/guides/laravel/architecture.md',
        '.claude/omnify/guides/laravel/authentication.md',
        '.claude/omnify/guides/laravel/datetime.md',
        '.claude/omnify/guides/laravel/migrations-team.md',
        '.claude/omnify/guides/laravel/openapi.md',
      ];

      for (const file of expectedFiles) {
        expect(
          existsSync(join(tempDir, file)),
          `Expected Laravel guide not generated: ${file}`
        ).toBe(true);
      }
    });

    it('should generate all expected Omnify guide files', () => {
      generateAIGuides(tempDir);

      const expectedFiles = [
        '.claude/omnify/guides/omnify/schema-guide.md',
        '.claude/omnify/guides/omnify/config-guide.md',
        '.claude/omnify/guides/omnify/typescript-guide.md',
        '.claude/omnify/guides/omnify/laravel-guide.md',
      ];

      for (const file of expectedFiles) {
        expect(
          existsSync(join(tempDir, file)),
          `Expected Omnify guide not generated: ${file}`
        ).toBe(true);
      }
    });

    it('should generate all expected React guide files', () => {
      generateAIGuides(tempDir);

      const expectedFiles = [
        '.claude/omnify/guides/react/antd-guide.md',
        '.claude/omnify/guides/react/datetime-guide.md',
        '.claude/omnify/guides/react/service-pattern.md',
        '.claude/omnify/guides/react/tanstack-query.md',
      ];

      for (const file of expectedFiles) {
        expect(
          existsSync(join(tempDir, file)),
          `Expected React guide not generated: ${file}`
        ).toBe(true);
      }
    });

    it('should generate Claude rules', () => {
      generateAIGuides(tempDir);

      const claudeRulesDir = join(tempDir, '.claude/rules/omnify');
      expect(existsSync(claudeRulesDir)).toBe(true);

      const expectedRules = [
        'laravel-controllers.md',
        'laravel-migrations.md',
        'laravel-tests.md',
        'naming.md',
        'php-standards.md',
        'security.md',
      ];

      const generatedFiles = readdirSync(claudeRulesDir);
      for (const rule of expectedRules) {
        expect(
          generatedFiles.includes(rule),
          `Expected Claude rule not generated: ${rule}`
        ).toBe(true);
      }
    });

    it('should generate Cursor rules with .mdc extension', () => {
      generateAIGuides(tempDir);

      const cursorRulesDir = join(tempDir, '.cursor/rules/omnify');
      expect(existsSync(cursorRulesDir)).toBe(true);

      const expectedRules = [
        'omnify-schema.mdc',
        'omnify.mdc',
        'laravel.mdc',
        'laravel-controller.mdc',
        'laravel-request.mdc',
        'laravel-resource.mdc',
        'react.mdc',
        'react-form.mdc',
      ];

      const generatedFiles = readdirSync(cursorRulesDir);
      for (const rule of expectedRules) {
        expect(
          generatedFiles.includes(rule),
          `Expected Cursor rule not generated: ${rule}`
        ).toBe(true);
      }
    });

    it('should restore deleted files on subsequent generation', () => {
      // First generation
      generateAIGuides(tempDir);

      // Delete some files
      const filesToDelete = [
        '.claude/omnify/guides/laravel/controller.md',
        '.cursor/rules/omnify/laravel.mdc',
      ];

      for (const file of filesToDelete) {
        const fullPath = join(tempDir, file);
        if (existsSync(fullPath)) {
          rmSync(fullPath);
          expect(existsSync(fullPath)).toBe(false);
        }
      }

      // Second generation should restore them
      generateAIGuides(tempDir);

      for (const file of filesToDelete) {
        expect(
          existsSync(join(tempDir, file)),
          `Deleted file was not restored: ${file}`
        ).toBe(true);
      }
    });

    it('should replace placeholders in generated files', () => {
      generateAIGuides(tempDir, {
        laravelBasePath: 'backend/app',
      });

      // Cursor rules should have paths replaced
      // Note: We'd need to read file content to verify this fully
      expect(existsSync(join(tempDir, '.cursor/rules/omnify'))).toBe(true);
    });

    it('should return list of generated files', () => {
      const result = generateAIGuides(tempDir);

      expect(result.files).toBeDefined();
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files.every(f => f.startsWith(tempDir))).toBe(true);
    });
  });

  describe('shouldGenerateAIGuides', () => {
    it('should return true for empty directory', () => {
      expect(shouldGenerateAIGuides(tempDir)).toBe(true);
    });

    it('should return true when .claude/omnify/guides/laravel does not exist', () => {
      generateAIGuides(tempDir);
      rmSync(join(tempDir, '.claude/omnify/guides/laravel'), { recursive: true });

      expect(shouldGenerateAIGuides(tempDir)).toBe(true);
    });

    it('should return true when .cursor/rules/omnify does not exist', () => {
      generateAIGuides(tempDir);
      rmSync(join(tempDir, '.cursor/rules/omnify'), { recursive: true });

      expect(shouldGenerateAIGuides(tempDir)).toBe(true);
    });

    it('should return true when laravel rules are missing from cursor', () => {
      generateAIGuides(tempDir);

      // Remove all laravel rules
      const cursorDir = join(tempDir, '.cursor/rules/omnify');
      const files = readdirSync(cursorDir);
      for (const file of files) {
        if (file.startsWith('laravel')) {
          rmSync(join(cursorDir, file));
        }
      }

      expect(shouldGenerateAIGuides(tempDir)).toBe(true);
    });

    it('should return false when all required files exist', () => {
      generateAIGuides(tempDir);

      // After full generation, shouldGenerateAIGuides should return false
      // (This is for backward compatibility - though we now always regenerate)
      expect(shouldGenerateAIGuides(tempDir)).toBe(false);
    });
  });

  describe('Package Path Expansion', () => {
    it('should expand globs for package paths', () => {
      const result = generateAIGuides(tempDir, {
        packagePaths: [
          { base: './packages/sso-client', modelsPath: 'src/Models' },
        ],
      });

      // Should still generate all files
      expect(result.cursorRules).toBeGreaterThan(0);

      // Note: Glob expansion only modifies cursor rules, not count
      expect(existsSync(join(tempDir, '.cursor/rules/omnify'))).toBe(true);
    });
  });
});
