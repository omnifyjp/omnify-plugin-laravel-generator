/**
 * AI Guides Generator (Laravel)
 *
 * Laravelプロジェクト用のAIガイド生成
 * @famgia/omnify-coreの統一ジェネレーターを使用
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
    generateAIGuides as coreGenerateAIGuides,
    type AIGuidesResult as CoreAIGuidesResult,
} from '@famgia/omnify-core';

/**
 * Package path configuration for AI guides
 */
export interface PackagePath {
    /** Base path of the package (e.g., './packages/omnify-sso-client') */
    base: string;
    /** Models path relative to base (e.g., 'src/Models') */
    modelsPath?: string;
    /** Migrations path relative to base (e.g., 'database/migrations') */
    migrationsPath?: string;
}

/**
 * Options for AI guides generation
 */
export interface AIGuidesOptions {
    /**
     * Laravel models path from config (e.g., 'app/Models')
     * Used to extract the base path for glob replacement
     */
    modelsPath?: string;

    /**
     * Laravel migrations path from config
     */
    migrationsPath?: string;

    /**
     * Base path for Laravel files (default: extracted from modelsPath or 'app')
     * Used for placeholder replacement in Cursor rules
     */
    laravelBasePath?: string;

    /**
     * TypeScript/React base path (e.g., 'resources/ts' or 'frontend/src')
     * Used for placeholder replacement in Cursor rules
     */
    typescriptBasePath?: string;

    /**
     * Additional package paths from additionalSchemaPaths config
     * Used to expand globs to include package directories
     */
    packagePaths?: PackagePath[];
}

/**
 * Result of AI guides generation
 */
export interface AIGuidesResult {
    claudeGuides: number;
    claudeRules: number;
    claudeChecklists: number;
    claudeWorkflows: number;
    claudeAgents: number;
    claudeOmnify: number;
    cursorRules: number;
    antigravityRules: number;
    files: string[];
}

/**
 * Extract Laravel app path from modelsPath
 * e.g., 'app/Models' -> 'app'
 * e.g., 'backend/app/Models' -> 'backend/app'
 */
function extractLaravelBasePath(modelsPath?: string): string {
    if (!modelsPath) return 'app';

    // Remove 'Models' or 'Models/...' suffix
    const normalized = modelsPath.replace(/\\/g, '/');
    const match = normalized.match(/^(.+?)\/Models(?:\/.*)?$/);
    if (match && match[1]) {
        return match[1];
    }

    // Fallback: get directory of modelsPath
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length > 1) {
        return parts.slice(0, -1).join('/');
    }

    return 'app';
}

/**
 * Extract Laravel project root from basePath
 * e.g., 'app' -> '' (standard Laravel)
 * e.g., 'backend/app' -> 'backend' (monorepo)
 */
function extractLaravelRoot(basePath: string): string {
    const normalized = basePath.replace(/\\/g, '/');
    const match = normalized.match(/^(.+?)\/app$/);
    if (match && match[1]) {
        return match[1];
    }
    return '';
}

/**
 * Expand globs in cursor rule files to include package paths
 * Finds patterns like "app/Models/..." and adds equivalent package patterns
 */
function expandPackageGlobs(
    cursorRulesDir: string,
    basePath: string,
    packagePaths: PackagePath[]
): void {
    if (!packagePaths.length || !existsSync(cursorRulesDir)) {
        return;
    }

    const files = readdirSync(cursorRulesDir).filter(f => f.endsWith('.mdc'));

    for (const file of files) {
        const filePath = join(cursorRulesDir, file);
        let content = readFileSync(filePath, 'utf-8');

        // Check if file has frontmatter with globs
        if (!content.startsWith('---')) continue;

        const endIndex = content.indexOf('---', 3);
        if (endIndex === -1) continue;

        const frontmatter = content.substring(0, endIndex + 3);
        const body = content.substring(endIndex + 3);

        // Parse globs from frontmatter
        const globsMatch = frontmatter.match(/globs:\s*\[([^\]]*)\]/);
        if (!globsMatch) continue;

        const originalGlobs = globsMatch[1]
            .split(',')
            .map(g => g.trim().replace(/["']/g, ''))
            .filter(Boolean);

        // Specific patterns to expand (Models, OmnifyBase)
        const specificPatterns = [
            { pattern: `${basePath}/Models/OmnifyBase/`, suffix: 'Models/OmnifyBase/' },
            { pattern: `${basePath}/Models/`, suffix: 'Models/' },
        ];

        // General app pattern (e.g., "app/**/*.php")
        const generalAppPattern = `${basePath}/**/*.php`;

        const newGlobs: string[] = [];

        for (const glob of originalGlobs) {
            newGlobs.push(glob);

            // Check for general app pattern first (e.g., "app/**/*.php" -> "packages/*/src/**/*.php")
            if (glob === generalAppPattern) {
                for (const pkg of packagePaths) {
                    const pkgBase = pkg.base.replace(/^\.\//, '');
                    const pkgGlob = `${pkgBase}/src/**/*.php`;
                    if (!newGlobs.includes(pkgGlob)) {
                        newGlobs.push(pkgGlob);
                    }
                }
                continue;
            }

            // Check for specific patterns (Models, OmnifyBase)
            for (const { pattern, suffix } of specificPatterns) {
                if (glob.includes(pattern)) {
                    // Add equivalent patterns for each package
                    for (const pkg of packagePaths) {
                        const pkgBase = pkg.base.replace(/^\.\//, '');
                        const pkgModelsPath = pkg.modelsPath ?? 'src/Models';

                        // Map the pattern to package path
                        const afterModels = glob.split(pattern)[1] || '';
                        const modelsSuffix = suffix.replace('Models/', '');
                        const pkgGlob = `${pkgBase}/${pkgModelsPath}/${modelsSuffix}${afterModels}`;

                        // Avoid duplicates
                        if (!newGlobs.includes(pkgGlob)) {
                            newGlobs.push(pkgGlob);
                        }
                    }
                    break; // Only expand once per glob
                }
            }
        }

        // If globs were expanded, update the file
        if (newGlobs.length > originalGlobs.length) {
            const newGlobsStr = newGlobs.map(g => `"${g}"`).join(', ');
            const newFrontmatter = frontmatter.replace(
                /globs:\s*\[[^\]]*\]/,
                `globs: [${newGlobsStr}]`
            );
            writeFileSync(filePath, newFrontmatter + body);
        }
    }
}

/**
 * Generate AI guides for Claude and Cursor
 */
export function generateAIGuides(
    rootDir: string,
    options: AIGuidesOptions = {}
): AIGuidesResult {
    const basePath = options.laravelBasePath || extractLaravelBasePath(options.modelsPath);
    const laravelRoot = extractLaravelRoot(basePath);
    const tsPath = options.typescriptBasePath || 'resources/ts';

    // Coreジェネレーターを呼び出し
    const coreResult = coreGenerateAIGuides(rootDir, {
        placeholders: {
            LARAVEL_BASE: basePath,
            LARAVEL_ROOT: laravelRoot ? laravelRoot + '/' : '',
            TYPESCRIPT_BASE: tsPath,
        },
    });

    // Expand globs in cursor rules to include package paths
    if (options.packagePaths?.length) {
        const cursorRulesDir = resolve(rootDir, '.cursor/rules/omnify');
        expandPackageGlobs(cursorRulesDir, basePath, options.packagePaths);
    }

    // 結果を変換 (後方互換性のため)
    const result: AIGuidesResult = {
        claudeGuides: 0,
        claudeRules: 0,
        claudeChecklists: 0,
        claudeWorkflows: 0,
        claudeAgents: 0,
        claudeOmnify: 0,
        cursorRules: 0,
        antigravityRules: 0,
        files: coreResult.files,
    };

    // ファイル数を概算 (後方互換のため)
    const claudeCount = coreResult.counts['claude'] || 0;
    const cursorCount = coreResult.counts['cursor'] || 0;
    const antigravityCount = coreResult.counts['antigravity'] || 0;

    result.claudeGuides = Math.floor(claudeCount * 0.4);
    result.claudeRules = Math.floor(claudeCount * 0.2);
    result.claudeChecklists = Math.floor(claudeCount * 0.1);
    result.claudeWorkflows = Math.floor(claudeCount * 0.1);
    result.claudeAgents = Math.floor(claudeCount * 0.1);
    result.claudeOmnify = claudeCount - result.claudeGuides - result.claudeRules - result.claudeChecklists - result.claudeWorkflows - result.claudeAgents;
    result.cursorRules = cursorCount;
    result.antigravityRules = antigravityCount;

    return result;
}

/**
 * Check if AI guides need to be generated
 */
export function shouldGenerateAIGuides(rootDir: string): boolean {
    const claudeDir = resolve(rootDir, '.claude/omnify/guides/laravel');
    const cursorDir = resolve(rootDir, '.cursor/rules/omnify');

    if (!existsSync(claudeDir) || !existsSync(cursorDir)) {
        return true;
    }

    try {
        const claudeFiles = readdirSync(claudeDir);
        const cursorFiles = readdirSync(cursorDir);
        const hasLaravelRules = cursorFiles.some((f) => f.startsWith('laravel'));

        return claudeFiles.length === 0 || !hasLaravelRules;
    } catch {
        return true;
    }
}
