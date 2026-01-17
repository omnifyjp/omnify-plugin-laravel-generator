/**
 * @famgia/omnify-laravel - ALTER Migration Generator
 *
 * Generates Laravel migration files for ALTER table operations.
 */

import type { SchemaChange, PropertySnapshot } from '@famgia/omnify-atlas';
import type { MigrationFile, MigrationOptions } from './types.js';
import { toTableName, toColumnName } from './schema-builder.js';

/**
 * Maps Omnify property types to Laravel column methods.
 */
const TYPE_METHOD_MAP: Record<string, string> = {
  String: 'string',
  TinyInt: 'tinyInteger',
  Int: 'integer',
  BigInt: 'bigInteger',
  Float: 'double',
  Decimal: 'decimal',
  Boolean: 'boolean',
  Text: 'text',
  MediumText: 'mediumText',
  LongText: 'longText',
  Date: 'date',
  Time: 'time',
  DateTime: 'dateTime',
  Timestamp: 'timestamp',
  Json: 'json',
  Email: 'string',
  Password: 'string',
  File: 'string',
  MultiFile: 'json',
  Enum: 'enum',
  Select: 'string',
  Lookup: 'unsignedBigInteger',
};

/**
 * Checks if an Association property creates a FK column.
 * ManyToOne and OneToOne (owning side) create FK columns.
 */
function isAssociationWithFkColumn(prop: PropertySnapshot): boolean {
  if (prop.type !== 'Association') return false;

  const relation = prop.relation;
  if (relation !== 'ManyToOne' && relation !== 'OneToOne') return false;

  // mappedBy means inverse side - no FK column
  if (prop.mappedBy) return false;

  return true;
}

/**
 * Gets the FK column name for an Association property.
 */
function getAssociationFkColumnName(columnName: string): string {
  const snakeColumn = toColumnName(columnName);
  return `${snakeColumn}_id`;
}

/**
 * Generates timestamp prefix for migration file name.
 */
function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}_${month}_${day}_${hours}${minutes}${seconds}`;
}

/**
 * Formats a column addition.
 * Returns an array of lines (column + optional FK constraint).
 */
function formatAddColumn(columnName: string, prop: PropertySnapshot): string[] {
  const lines: string[] = [];

  // Association型の場合、FKカラムとFKコンストレイントを生成
  if (isAssociationWithFkColumn(prop)) {
    const fkColumn = getAssociationFkColumnName(columnName);
    // デフォルトはunsignedBigInteger（将来的にターゲットスキーマのidTypeを参照すべき）
    let code = `$table->unsignedBigInteger('${fkColumn}')`;

    if (prop.nullable) code += '->nullable()';

    lines.push(code + ';');

    // FKコンストレイント
    if (prop.target) {
      // ターゲットテーブル名を生成（スキーマ名からテーブル名へ変換）
      const targetTable = toTableName(prop.target);
      let fkCode = `$table->foreign('${fkColumn}')->references('id')->on('${targetTable}')`;

      if (prop.onDelete) {
        fkCode += `->onDelete('${prop.onDelete}')`;
      }
      if (prop.onUpdate) {
        fkCode += `->onUpdate('${prop.onUpdate}')`;
      }

      lines.push(fkCode + ';');
    }

    return lines;
  }

  const snakeColumn = toColumnName(columnName);
  const method = TYPE_METHOD_MAP[prop.type] ?? 'string';

  let code: string;

  // Handle decimal with precision and scale
  if (prop.type === 'Decimal') {
    const precision = prop.precision ?? 8;
    const scale = prop.scale ?? 2;
    code = `$table->${method}('${snakeColumn}', ${precision}, ${scale})`;
  } else {
    code = `$table->${method}('${snakeColumn}')`;
  }

  // Add modifiers
  if (prop.nullable) code += '->nullable()';
  if (prop.unique) code += '->unique()';
  if (prop.default !== undefined) {
    const defaultValue = typeof prop.default === 'string'
      ? `'${prop.default}'`
      : JSON.stringify(prop.default);
    code += `->default(${defaultValue})`;
  }

  lines.push(code + ';');
  return lines;
}

/**
 * Formats a column removal.
 * Returns an array of lines (drop FK constraint first if needed, then column).
 */
function formatDropColumn(columnName: string, prop?: PropertySnapshot): string[] {
  const lines: string[] = [];

  // Association型の場合、FKコンストレイントを先に削除
  if (prop && isAssociationWithFkColumn(prop)) {
    const fkColumn = getAssociationFkColumnName(columnName);
    // LaravelのFKコンストレイント名規則: {table}_{column}_foreign
    // ここではテーブル名がないため、dropForeignはカラム配列で指定
    lines.push(`$table->dropForeign(['${fkColumn}']);`);
    lines.push(`$table->dropColumn('${fkColumn}');`);
    return lines;
  }

  const snakeColumn = toColumnName(columnName);
  lines.push(`$table->dropColumn('${snakeColumn}');`);
  return lines;
}

/**
 * Formats a column rename.
 * Note: Requires doctrine/dbal package in Laravel.
 */
function formatRenameColumn(oldName: string, newName: string): string {
  const oldSnake = toColumnName(oldName);
  const newSnake = toColumnName(newName);
  return `$table->renameColumn('${oldSnake}', '${newSnake}');`;
}

/**
 * Formats a column modification.
 * Note: Requires doctrine/dbal package in Laravel.
 */
function formatModifyColumn(
  columnName: string,
  _prevProp: PropertySnapshot,
  currProp: PropertySnapshot
): string {
  const snakeColumn = toColumnName(columnName);
  const method = TYPE_METHOD_MAP[currProp.type] ?? 'string';

  let code: string;

  // Handle decimal with precision and scale
  if (currProp.type === 'Decimal') {
    const precision = currProp.precision ?? 8;
    const scale = currProp.scale ?? 2;
    code = `$table->${method}('${snakeColumn}', ${precision}, ${scale})`;
  } else {
    code = `$table->${method}('${snakeColumn}')`;
  }

  // Add modifiers
  if (currProp.nullable) code += '->nullable()';
  if (currProp.unique) code += '->unique()';
  if (currProp.default !== undefined) {
    const defaultValue = typeof currProp.default === 'string'
      ? `'${currProp.default}'`
      : JSON.stringify(currProp.default);
    code += `->default(${defaultValue})`;
  }

  return code + '->change();';
}

/**
 * Formats an index addition.
 */
function formatAddIndex(columns: readonly string[], unique: boolean): string {
  const snakeColumns = columns.map(toColumnName);
  const method = unique ? 'unique' : 'index';
  const colsArg = snakeColumns.length === 1
    ? `'${snakeColumns[0]}'`
    : `[${snakeColumns.map(c => `'${c}'`).join(', ')}]`;

  return `$table->${method}(${colsArg});`;
}

/**
 * Formats an index removal.
 */
function formatDropIndex(tableName: string, columns: readonly string[], unique: boolean): string {
  const snakeColumns = columns.map(toColumnName);
  const method = unique ? 'dropUnique' : 'dropIndex';

  // Laravel generates index names as: {table}_{columns}_{type}
  const suffix = unique ? 'unique' : 'index';
  const indexName = `${tableName}_${snakeColumns.join('_')}_${suffix}`;

  return `$table->${method}('${indexName}');`;
}

/**
 * Generates ALTER migration content for a schema change.
 */
function generateAlterMigrationContent(
  tableName: string,
  change: SchemaChange,
  options: MigrationOptions = {}
): string {
  const upLines: string[] = [];
  const downLines: string[] = [];

  // Column changes
  if (change.columnChanges) {
    for (const col of change.columnChanges) {
      if (col.changeType === 'added' && col.currentDef) {
        const addLines = formatAddColumn(col.column, col.currentDef);
        for (const line of addLines) {
          upLines.push(`            ${line}`);
        }
        const dropLines = formatDropColumn(col.column, col.currentDef);
        for (const line of dropLines) {
          downLines.push(`            ${line}`);
        }
      } else if (col.changeType === 'removed' && col.previousDef) {
        const dropLines = formatDropColumn(col.column, col.previousDef);
        for (const line of dropLines) {
          upLines.push(`            ${line}`);
        }
        const addLines = formatAddColumn(col.column, col.previousDef);
        for (const line of addLines) {
          downLines.push(`            ${line}`);
        }
      } else if (col.changeType === 'modified' && col.previousDef && col.currentDef) {
        upLines.push(`            ${formatModifyColumn(col.column, col.previousDef, col.currentDef)}`);
        downLines.push(`            ${formatModifyColumn(col.column, col.currentDef, col.previousDef)}`);
      } else if (col.changeType === 'renamed' && col.previousColumn) {
        // Rename column
        upLines.push(`            ${formatRenameColumn(col.previousColumn, col.column)}`);
        downLines.push(`            ${formatRenameColumn(col.column, col.previousColumn)}`);

        // If there are also property modifications, apply them after rename
        if (col.modifications && col.modifications.length > 0 && col.previousDef && col.currentDef) {
          upLines.push(`            ${formatModifyColumn(col.column, col.previousDef, col.currentDef)}`);
          downLines.push(`            ${formatModifyColumn(col.column, col.currentDef, col.previousDef)}`);
        }
      }
    }
  }

  // Index changes
  if (change.indexChanges) {
    for (const idx of change.indexChanges) {
      if (idx.changeType === 'added') {
        upLines.push(`            ${formatAddIndex(idx.index.columns, idx.index.unique)}`);
        downLines.push(`            ${formatDropIndex(tableName, idx.index.columns, idx.index.unique)}`);
      } else {
        upLines.push(`            ${formatDropIndex(tableName, idx.index.columns, idx.index.unique)}`);
        downLines.push(`            ${formatAddIndex(idx.index.columns, idx.index.unique)}`);
      }
    }
  }

  // Option changes (timestamps, softDelete, idType)
  if (change.optionChanges) {
    if (change.optionChanges.timestamps) {
      const { from, to } = change.optionChanges.timestamps;
      if (to && !from) {
        upLines.push(`            $table->timestamps();`);
        downLines.push(`            $table->dropTimestamps();`);
      } else if (from && !to) {
        upLines.push(`            $table->dropTimestamps();`);
        downLines.push(`            $table->timestamps();`);
      }
    }

    if (change.optionChanges.softDelete) {
      const { from, to } = change.optionChanges.softDelete;
      if (to && !from) {
        upLines.push(`            $table->softDeletes();`);
        downLines.push(`            $table->dropSoftDeletes();`);
      } else if (from && !to) {
        upLines.push(`            $table->dropSoftDeletes();`);
        downLines.push(`            $table->softDeletes();`);
      }
    }

    // Handle idType changes (BigInt <-> Uuid <-> Int <-> String)
    // This is a complex operation requiring primary key column type change
    if (change.optionChanges.idType) {
      const { from, to } = change.optionChanges.idType;
      const fromType = from ?? 'BigInt';
      const toType = to ?? 'BigInt';

      // Generate appropriate column type change for primary key
      const getColumnMethod = (type: string): string => {
        switch (type) {
          case 'Uuid': return 'uuid';
          case 'Int': return 'unsignedInteger';
          case 'String': return 'string';
          default: return 'unsignedBigInteger'; // BigInt
        }
      };

      const toMethod = getColumnMethod(toType);
      const fromMethod = getColumnMethod(fromType);

      // Use DB::statement for raw SQL to modify primary key column type
      // This is necessary because Laravel's change() doesn't work well with primary keys
      upLines.push(`            // Changing primary key type from ${fromType} to ${toType}`);
      upLines.push(`            // Note: This requires doctrine/dbal package`);
      if (toType === 'Uuid') {
        upLines.push(`            $table->dropPrimary('id');`);
        upLines.push(`            $table->uuid('id')->change();`);
        upLines.push(`            $table->primary('id');`);
      } else if (fromType === 'Uuid') {
        upLines.push(`            $table->dropPrimary('id');`);
        upLines.push(`            $table->${toMethod}('id')->change();`);
        upLines.push(`            $table->primary('id');`);
      } else {
        // For Int <-> BigInt changes, simpler column type change
        upLines.push(`            $table->${toMethod}('id')->change();`);
      }

      downLines.push(`            // Reverting primary key type from ${toType} to ${fromType}`);
      if (fromType === 'Uuid') {
        downLines.push(`            $table->dropPrimary('id');`);
        downLines.push(`            $table->uuid('id')->change();`);
        downLines.push(`            $table->primary('id');`);
      } else if (toType === 'Uuid') {
        downLines.push(`            $table->dropPrimary('id');`);
        downLines.push(`            $table->${fromMethod}('id')->change();`);
        downLines.push(`            $table->primary('id');`);
      } else {
        downLines.push(`            $table->${fromMethod}('id')->change();`);
      }
    }
  }

  const connection = options.connection
    ? `\n    protected $connection = '${options.connection}';\n`
    : '';

  return `<?php

/**
 * ⚠️ DO NOT EDIT THIS FILE! ⚠️
 * このファイルを編集しないでください！
 * KHÔNG ĐƯỢC SỬA FILE NÀY!
 *
 * This file is AUTO-GENERATED by Omnify.
 * Any manual changes will be OVERWRITTEN on next generation.
 *
 * To modify: Edit the schema YAML file and run: npx omnify generate
 *
 * @generated by @famgia/omnify-laravel
 */

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{${connection}
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('${tableName}', function (Blueprint $table) {
${upLines.join('\n')}
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('${tableName}', function (Blueprint $table) {
${downLines.join('\n')}
        });
    }
};
`;
}

/**
 * Generates ALTER migration for a modified schema.
 */
export function generateAlterMigration(
  change: SchemaChange,
  options: MigrationOptions = {}
): MigrationFile | null {
  if (change.changeType !== 'modified') {
    return null;
  }

  // Check if there are actual changes to migrate
  const hasChanges =
    (change.columnChanges && change.columnChanges.length > 0) ||
    (change.indexChanges && change.indexChanges.length > 0) ||
    (change.optionChanges &&
      (change.optionChanges.timestamps ||
        change.optionChanges.softDelete ||
        change.optionChanges.idType));

  if (!hasChanges) {
    return null;
  }

  const tableName = toTableName(change.schemaName);
  const timestamp = options.timestamp ?? generateTimestamp();
  const fileName = `${timestamp}_update_${tableName}_table.php`;

  const content = generateAlterMigrationContent(tableName, change, options);

  return {
    fileName,
    className: `Update${change.schemaName}Table`,
    content,
    tables: [tableName],
    type: 'alter',
  };
}

/**
 * Generates DROP migration for a removed schema.
 */
export function generateDropTableMigration(
  schemaName: string,
  options: MigrationOptions = {}
): MigrationFile {
  const tableName = toTableName(schemaName);
  const timestamp = options.timestamp ?? generateTimestamp();
  const fileName = `${timestamp}_drop_${tableName}_table.php`;

  const connection = options.connection
    ? `\n    protected $connection = '${options.connection}';\n`
    : '';

  const content = `<?php

/**
 * ⚠️ DO NOT EDIT THIS FILE! ⚠️
 * このファイルを編集しないでください！
 * KHÔNG ĐƯỢC SỬA FILE NÀY!
 *
 * This file is AUTO-GENERATED by Omnify.
 * Any manual changes will be OVERWRITTEN on next generation.
 *
 * @generated by @famgia/omnify-laravel
 */

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{${connection}
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('${tableName}');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Cannot recreate table without full schema
        // Consider restoring from backup if needed
    }
};
`;

  return {
    fileName,
    className: `Drop${schemaName}Table`,
    content,
    tables: [tableName],
    type: 'drop',
  };
}

/**
 * Generates migrations for all schema changes.
 */
export function generateMigrationsFromChanges(
  changes: readonly SchemaChange[],
  options: MigrationOptions = {}
): MigrationFile[] {
  const migrations: MigrationFile[] = [];
  let timestampOffset = 0;

  // Generate base timestamp ONCE for all migrations to ensure consistent ordering
  const baseTimestamp = options.timestamp ?? generateTimestamp();

  const getNextTimestamp = () => {
    const offset = timestampOffset++;
    if (offset === 0) return baseTimestamp;

    // Increment seconds
    const parts = baseTimestamp.split('_');
    if (parts.length >= 4) {
      const timePart = parts[3] ?? '000000';
      const secs = parseInt(timePart.substring(4, 6), 10) + offset;
      const newSecs = String(secs % 60).padStart(2, '0');
      parts[3] = timePart.substring(0, 4) + newSecs;
      return parts.join('_');
    }
    return baseTimestamp;
  };

  for (const change of changes) {
    if (change.changeType === 'modified') {
      const migration = generateAlterMigration(change, {
        ...options,
        timestamp: getNextTimestamp(),
      });
      if (migration) {
        migrations.push(migration);
      }
    } else if (change.changeType === 'removed') {
      migrations.push(
        generateDropTableMigration(change.schemaName, {
          ...options,
          timestamp: getNextTimestamp(),
        })
      );
    }
    // 'added' changes are handled by the regular CREATE migration generator
  }

  return migrations;
}
