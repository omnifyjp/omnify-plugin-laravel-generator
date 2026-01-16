/**
 * Laravel Model Generator
 *
 * Generates Eloquent model classes from Omnify schemas.
 * Creates base models (auto-generated) and user models (created once).
 */

import type { LoadedSchema, PropertyDefinition, AssociationDefinition, SchemaCollection, LocalizedString, CustomTypeDefinition } from '@famgia/omnify-types';
import { isLocaleMap } from '@famgia/omnify-types';
import { pluralize, toSnakeCase, toPascalCase, toCamelCase } from '../utils.js';

/**
 * Options for model generation.
 */
export interface ModelGeneratorOptions {
  /**
   * Base model namespace.
   * @default 'App\\Models\\OmnifyBase'
   */
  baseModelNamespace?: string;

  /**
   * User model namespace.
   * @default 'App\\Models'
   */
  modelNamespace?: string;

  /**
   * Base model class name.
   * @default 'BaseModel'
   */
  baseModelClassName?: string;

  /**
   * Output path for base models.
   * @default 'app/Models/OmnifyBase'
   */
  baseModelPath?: string;

  /**
   * Output path for user models.
   * @default 'app/Models'
   */
  modelPath?: string;

  /**
   * Output path for service provider files.
   * @default 'app/Providers'
   */
  providersPath?: string;

  /**
   * Custom types registered by plugins.
   * Used to expand compound types in fillable array.
   */
  customTypes?: ReadonlyMap<string, CustomTypeDefinition>;
}

/**
 * Generated model output.
 */
export interface GeneratedModel {
  /** File path relative to project root */
  path: string;
  /** PHP content */
  content: string;
  /** Model type */
  type: 'base-model' | 'entity-base' | 'entity' | 'service-provider' | 'provider-registration' | 'trait' | 'locales';
  /** Whether to overwrite existing file */
  overwrite: boolean;
  /** Schema name */
  schemaName: string;
}

/**
 * Provider registration result.
 */
export interface ProviderRegistrationResult {
  /** Path to the provider registration file */
  path: string;
  /** Modified content */
  content: string;
  /** Laravel version type */
  laravelVersion: 'laravel11+' | 'laravel10-';
  /** Whether registration was already present */
  alreadyRegistered: boolean;
}

/**
 * Resolved options with defaults.
 */
interface ResolvedOptions {
  baseModelNamespace: string;
  modelNamespace: string;
  baseModelClassName: string;
  baseModelPath: string;
  modelPath: string;
  providersPath: string;
  customTypes: ReadonlyMap<string, CustomTypeDefinition>;
}

/**
 * Default options.
 */
const DEFAULT_OPTIONS: ResolvedOptions = {
  baseModelNamespace: 'App\\Models\\OmnifyBase',
  modelNamespace: 'App\\Models',
  baseModelClassName: 'BaseModel',
  baseModelPath: 'app/Models/OmnifyBase',
  modelPath: 'app/Models',
  providersPath: 'app/Providers',
  customTypes: new Map(),
};

/**
 * Generate PHP array entries for localized display names.
 * Converts LocalizedString to PHP array format.
 */
function generateLocalizedDisplayNames(displayName: LocalizedString | undefined, indent: string = '        '): string {
  if (displayName === undefined) {
    return '';
  }

  if (typeof displayName === 'string') {
    // Single string - use 'en' as default locale
    return `${indent}'en' => '${escapePhpString(displayName)}',`;
  }

  if (isLocaleMap(displayName)) {
    const entries = Object.entries(displayName)
      .map(([locale, value]) => `${indent}'${locale}' => '${escapePhpString(value)}',`)
      .join('\n');
    return entries;
  }

  return '';
}

/**
 * Generate PHP array entries for property localized display names.
 */
function generatePropertyLocalizedDisplayNames(
  schema: LoadedSchema,
  indent: string = '        '
): string {
  const properties = schema.properties ?? {};
  const entries: string[] = [];

  for (const [propName, propDef] of Object.entries(properties)) {
    const snakeName = toSnakeCase(propName);
    const displayName = (propDef as { displayName?: LocalizedString }).displayName;

    if (displayName === undefined) {
      continue;
    }

    const innerIndent = indent + '    ';

    if (typeof displayName === 'string') {
      entries.push(`${indent}'${snakeName}' => [\n${innerIndent}'en' => '${escapePhpString(displayName)}',\n${indent}],`);
    } else if (isLocaleMap(displayName)) {
      const localeEntries = Object.entries(displayName)
        .map(([locale, value]) => `${innerIndent}'${locale}' => '${escapePhpString(value)}',`)
        .join('\n');
      entries.push(`${indent}'${snakeName}' => [\n${localeEntries}\n${indent}],`);
    }
  }

  return entries.join('\n');
}

/**
 * Escape string for PHP single-quoted string.
 */
function escapePhpString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Resolve options with defaults.
 */
function resolveOptions(options?: ModelGeneratorOptions): ResolvedOptions {
  return {
    baseModelNamespace: options?.baseModelNamespace ?? DEFAULT_OPTIONS.baseModelNamespace,
    modelNamespace: options?.modelNamespace ?? DEFAULT_OPTIONS.modelNamespace,
    baseModelClassName: options?.baseModelClassName ?? DEFAULT_OPTIONS.baseModelClassName,
    baseModelPath: options?.baseModelPath ?? DEFAULT_OPTIONS.baseModelPath,
    modelPath: options?.modelPath ?? DEFAULT_OPTIONS.modelPath,
    providersPath: options?.providersPath ?? DEFAULT_OPTIONS.providersPath,
    customTypes: options?.customTypes ?? new Map(),
  };
}

/**
 * スキーマのpackageOutputからオプションを解決
 * packageOutputがある場合はパッケージ用のオプションを返す
 */
function resolveSchemaOptions(schema: LoadedSchema, globalOptions: ResolvedOptions): ResolvedOptions {
  const pkgOutput = schema.packageOutput?.laravel;
  if (!pkgOutput) {
    return globalOptions;
  }

  // パッケージベースパスを取得
  const base = pkgOutput.base;

  // namespaceからベースnamespaceを導出 (例: 'Omnify\\SsoClient\\Models' → 'Omnify\\SsoClient')
  const modelsNs = pkgOutput.modelsNamespace;
  const baseNs = modelsNs.replace(/\\Models$/, '');

  return {
    modelNamespace: modelsNs,
    baseModelNamespace: pkgOutput.baseModelsNamespace ?? `${modelsNs}\\OmnifyBase`,
    baseModelClassName: 'BaseModel',
    modelPath: `${base}/${pkgOutput.modelsPath ?? 'src/Models'}`,
    baseModelPath: `${base}/${pkgOutput.baseModelsPath ?? 'src/Models/OmnifyBase'}`,
    providersPath: `${base}/${pkgOutput.providersPath ?? 'src/Providers'}`,
    customTypes: globalOptions.customTypes,
  };
}

/**
 * Get PHP type for casting.
 */
function getCastType(propDef: PropertyDefinition): string | null {
  switch (propDef.type) {
    case 'Boolean':
      return 'boolean';
    case 'Int':
    case 'BigInt':
      return 'integer';
    case 'Float':
      return 'float';
    case 'Decimal':
      return 'decimal:' + ((propDef as any).scale ?? 2);
    case 'Json':
      return 'array';
    case 'Date':
      return 'date';
    case 'DateTime':
    case 'Timestamp':
      return 'datetime';
    case 'Password':
      return 'hashed';
    default:
      return null;
  }
}

/**
 * Check if a property definition is nullable.
 * For associations, check the 'nullable' field if it exists as an extension.
 */
function isNullable(propDef: PropertyDefinition): boolean {
  // BasePropertyDefinition has nullable, AssociationDefinition does not
  // But some schemas may define nullable on associations as an extension
  return 'nullable' in propDef && propDef.nullable === true;
}

/**
 * Get PHP doc type for a property.
 */
function getPhpDocType(propDef: PropertyDefinition, schemas: SchemaCollection): string {
  const nullable = isNullable(propDef);

  switch (propDef.type) {
    case 'String':
    case 'Text':
    case 'LongText':
    case 'Email':
    case 'Password':
      return 'string' + (nullable ? '|null' : '');
    case 'Int':
    case 'BigInt':
      return 'int' + (nullable ? '|null' : '');
    case 'Float':
    case 'Decimal':
      return 'float' + (nullable ? '|null' : '');
    case 'Boolean':
      return 'bool' + (nullable ? '|null' : '');
    case 'Date':
    case 'DateTime':
    case 'Time':
    case 'Timestamp':
      return '\\Carbon\\Carbon' + (nullable ? '|null' : '');
    case 'Json':
      return 'array' + (nullable ? '|null' : '');
    case 'Enum':
    case 'EnumRef':
      return 'string' + (nullable ? '|null' : '');
    case 'Association': {
      const assoc = propDef as AssociationDefinition;
      if (assoc.target) {
        const className = toPascalCase(assoc.target);
        switch (assoc.relation) {
          case 'OneToMany':
          case 'ManyToMany':
          case 'MorphMany':
          case 'MorphToMany':
          case 'MorphedByMany':
            return `\\Illuminate\\Database\\Eloquent\\Collection<${className}>`;
          default:
            // ManyToOne, OneToOne - typically nullable unless owning
            return className + '|null';
        }
      }
      return 'mixed';
    }
    default:
      return 'mixed';
  }
}

/**
 * Expand compound type property into field names.
 * Returns array of field names (snake_case) or null if not a compound type.
 */
function expandCompoundTypeFields(
  propName: string,
  propType: string,
  customTypes: ReadonlyMap<string, CustomTypeDefinition>
): string[] | null {
  const typeDef = customTypes.get(propType);

  if (!typeDef || !typeDef.compound || !typeDef.expand) {
    return null;
  }

  const snakeName = toSnakeCase(propName);
  const fields: string[] = [];

  for (const field of typeDef.expand) {
    // Convert suffix to snake_case and combine with property name
    const suffixSnake = toSnakeCase(field.suffix);
    fields.push(`${snakeName}_${suffixSnake}`);
  }

  return fields;
}

/**
 * Generate the shared BaseModel class.
 */
function generateBaseModel(
  schemas: SchemaCollection,
  options: ResolvedOptions,
  stubContent: string
): GeneratedModel {
  // Build model map (exclude enum and partial, include pivot)
  const modelMap = Object.values(schemas)
    .filter(s => s.kind !== 'enum' && s.kind !== 'partial')
    .map(s => {
      const className = toPascalCase(s.name);
      return `        '${s.name}' => \\${options.modelNamespace}\\${className}::class,`;
    })
    .join('\n');

  const content = stubContent
    .replace(/\{\{BASE_MODEL_NAMESPACE\}\}/g, options.baseModelNamespace)
    .replace(/\{\{BASE_MODEL_CLASS\}\}/g, options.baseModelClassName)
    .replace(/\{\{MODEL_MAP\}\}/g, modelMap);

  return {
    path: `${options.baseModelPath}/${options.baseModelClassName}.php`,
    content,
    type: 'base-model',
    overwrite: true,
    schemaName: '__base__',
  };
}

/**
 * Generate entity base model (auto-generated).
 */
function generateEntityBaseModel(
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions,
  stubContent: string,
  authStubContent: string,
  pivotStubContent?: string
): GeneratedModel {
  const className = toPascalCase(schema.name);
  const tableName = schema.options?.tableName ?? pluralize(toSnakeCase(schema.name));
  const isAuth = schema.options?.authenticatable ?? false;

  // Determine primary key
  // Check if id is disabled and we need to find a custom primary key
  const hasAutoId = schema.options?.id !== false;
  let primaryKey = 'id';
  let isStringKey = false;
  let isUuid = false;
  let isNonIncrementing = false;

  if (hasAutoId) {
    // Standard auto-incrementing or UUID id
    const idType = schema.options?.idType ?? 'BigInt';
    isUuid = idType === 'Uuid';
    isStringKey = idType === 'Uuid' || idType === 'String';
    isNonIncrementing = isUuid;
  } else {
    // Custom primary key - find the property with primary: true
    const properties = schema.properties ?? {};
    for (const [propName, propDef] of Object.entries(properties)) {
      if ((propDef as { primary?: boolean }).primary === true) {
        primaryKey = toSnakeCase(propName);
        // Determine if it's a string-type key
        const propType = propDef.type;
        isStringKey = propType === 'String' || propType === 'Text' || propType === 'Email';
        isNonIncrementing = true; // Custom primary keys are not auto-incrementing
        break;
      }
    }
  }

  // Build imports, traits, fillable, hidden, casts, relations
  const imports: string[] = [];
  const traits: string[] = [];
  const fillable: string[] = [];
  const hidden: string[] = [];
  const appends: string[] = [];
  const casts: string[] = [];
  const relations: string[] = [];
  const docProperties: string[] = [];

  // Add soft delete
  if (schema.options?.softDelete) {
    imports.push('use Illuminate\\Database\\Eloquent\\SoftDeletes;');
    traits.push('    use SoftDeletes;');
  }

  // Process properties
  const properties = schema.properties ?? {};
  for (const [propName, propDef] of Object.entries(properties)) {
    const snakeName = toSnakeCase(propName);

    // Check if this is a compound type (defer docProperties to expanded fields)
    const typeDef = options.customTypes.get(propDef.type);
    const isCompoundType = typeDef?.compound && typeDef.expand;

    // Add to doc comments (skip for compound types - they'll be added per field)
    if (!isCompoundType) {
      const phpType = getPhpDocType(propDef, schemas);
      docProperties.push(` * @property ${phpType} $${snakeName}`);
    }

    if (propDef.type === 'Association') {
      const assoc = propDef as AssociationDefinition;
      if (assoc.target) {
        imports.push(`use ${options.modelNamespace}\\${toPascalCase(assoc.target)};`);
      }
      relations.push(generateRelation(propName, assoc, schema, schemas, options));

      // Add foreign key to fillable for belongsTo relations
      if (assoc.relation === 'ManyToOne' || assoc.relation === 'OneToOne') {
        if (!assoc.mappedBy) {
          const fkName = toSnakeCase(propName) + '_id';
          fillable.push(`        '${fkName}',`);
          docProperties.push(` * @property int|null $${fkName}`);
        }
      }
    } else if (propDef.type === 'Password') {
      // Check if fillable: false is set
      const propWithFillable = propDef as { fillable?: boolean };
      if (propWithFillable.fillable !== false) {
        fillable.push(`        '${snakeName}',`);
      }
      hidden.push(`        '${snakeName}',`);
      const cast = getCastType(propDef);
      if (cast) {
        casts.push(`            '${snakeName}' => '${cast}',`);
      }
    } else if (propDef.type === 'File') {
      // File properties don't add to fillable (polymorphic)
      const relMethod = generateFileRelation(propName, propDef as any);
      relations.push(relMethod);
    } else {
      // Check for fillable property (default: true)
      const propWithOptions = propDef as { fillable?: boolean; hidden?: boolean; fields?: Record<string, { nullable?: boolean; hidden?: boolean; fillable?: boolean }> };
      const isFillable = propWithOptions.fillable !== false;
      const isHidden = propWithOptions.hidden === true;

      // Check if this is a compound type that should be expanded
      const typeDef = options.customTypes.get(propDef.type);
      const isCompoundType = typeDef?.compound && typeDef.expand;

      if (isCompoundType && typeDef.expand) {
        // Compound type - process each expanded field with per-field overrides
        const fieldOverrides = propWithOptions.fields ?? {};
        const basePropWithNullable = propDef as { nullable?: boolean };

        for (const field of typeDef.expand) {
          const suffixSnake = toSnakeCase(field.suffix);
          const fieldName = `${snakeName}_${suffixSnake}`;
          const override = fieldOverrides[field.suffix];

          // Determine nullable for PHP type
          const fieldNullable = override?.nullable ?? basePropWithNullable.nullable ?? false;
          const phpType = field.typescript?.type === 'number' ? 'int' : 'string';
          const nullSuffix = fieldNullable ? '|null' : '';
          docProperties.push(` * @property ${phpType}${nullSuffix} $${fieldName}`);

          // Determine fillable: use field override if set, otherwise use property-level setting
          const fieldFillable = override?.fillable !== undefined ? override.fillable : isFillable;
          if (fieldFillable) {
            fillable.push(`        '${fieldName}',`);
          }

          // Determine hidden: use field override if set, otherwise use property-level setting
          const fieldHidden = override?.hidden !== undefined ? override.hidden : isHidden;
          if (fieldHidden) {
            hidden.push(`        '${fieldName}',`);
          }
        }
      } else {
        // Regular property
        if (isFillable) {
          fillable.push(`        '${snakeName}',`);
        }

        const cast = getCastType(propDef);
        if (cast) {
          casts.push(`            '${snakeName}' => '${cast}',`);
        }

        // Check for hidden: true property (for non-Password types)
        if (isHidden) {
          hidden.push(`        '${snakeName}',`);
        }
      }

      // Check for compound type accessors (reuse typeDef from above)
      if (typeDef?.compound && typeDef.accessors) {
        for (const accessor of typeDef.accessors) {
          // Generate accessor name with property prefix
          const accessorName = `${snakeName}_${toSnakeCase(accessor.name)}`;
          appends.push(`        '${accessorName}',`);

          // Generate accessor method
          const methodName = toPascalCase(accessorName);
          const separator = accessor.separator ?? ' ';

          // Build field references
          const fieldRefs = accessor.fields.map(field => {
            const fieldName = `${snakeName}_${toSnakeCase(field)}`;
            return `$this->${fieldName}`;
          });

          // Generate accessor method with null filtering for optional fields
          const accessorMethod = `    /**
     * Get the ${accessor.name.replace(/_/g, ' ')} attribute.
     */
    public function get${methodName}Attribute(): ?string
    {
        $parts = array_filter([${fieldRefs.join(', ')}], fn($v) => $v !== null && $v !== '');
        return count($parts) > 0 ? implode('${separator}', $parts) : null;
    }`;
          relations.push(accessorMethod);
        }
      }
    }
  }

  // Build doc comment
  const docComment = `/**
 * ${className}BaseModel
 *
${docProperties.join('\n')}
 */`;

  // Check if this is a pivot schema
  const isPivot = schema.kind === 'pivot';

  // Choose stub based on schema type
  let stub: string;
  if (isPivot && pivotStubContent) {
    stub = pivotStubContent;
  } else if (isAuth) {
    stub = authStubContent;
  } else {
    stub = stubContent;
  }

  // Build key type and incrementing
  const keyType = isStringKey ? `    /**
     * The "type" of the primary key ID.
     */
    protected $keyType = 'string';

` : '';

  const incrementing = isNonIncrementing ? `    /**
     * Indicates if the IDs are auto-incrementing.
     */
    public $incrementing = false;

` : '';

  // Add UUID trait if needed
  if (isUuid) {
    imports.push('use Illuminate\\Database\\Eloquent\\Concerns\\HasUuids;');
    traits.push('    use HasUuids;');
  }

  const content = stub
    .replace(/\{\{BASE_MODEL_NAMESPACE\}\}/g, options.baseModelNamespace)
    .replace(/\{\{BASE_MODEL_CLASS\}\}/g, options.baseModelClassName)
    .replace(/\{\{CLASS_NAME\}\}/g, className)
    .replace(/\{\{TABLE_NAME\}\}/g, tableName)
    .replace(/\{\{PRIMARY_KEY\}\}/g, primaryKey)
    .replace(/\{\{KEY_TYPE\}\}/g, keyType)
    .replace(/\{\{INCREMENTING\}\}/g, incrementing)
    .replace(/\{\{TIMESTAMPS\}\}/g, schema.options?.timestamps !== false ? 'true' : 'false')
    .replace(/\{\{IMPORTS\}\}/g, [...new Set(imports)].sort().join('\n'))
    .replace(/\{\{TRAITS\}\}/g, traits.join('\n'))
    .replace(/\{\{DOC_COMMENT\}\}/g, docComment)
    .replace(/\{\{FILLABLE\}\}/g, fillable.join('\n'))
    .replace(/\{\{HIDDEN\}\}/g, hidden.join('\n'))
    .replace(/\{\{APPENDS\}\}/g, appends.join('\n'))
    .replace(/\{\{CASTS\}\}/g, casts.join('\n'))
    .replace(/\{\{RELATIONS\}\}/g, relations.join('\n\n'));

  return {
    path: `${options.baseModelPath}/${className}BaseModel.php`,
    content,
    type: 'entity-base',
    overwrite: true,
    schemaName: schema.name,
  };
}

/**
 * Find the inverse ManyToOne relationship on target schema that points back to current schema.
 */
function findInverseRelation(
  currentSchemaName: string,
  targetSchemaName: string,
  schemas: SchemaCollection
): string | null {
  const targetSchema = schemas[targetSchemaName];
  if (!targetSchema || !targetSchema.properties) {
    return null;
  }

  for (const [propName, propDef] of Object.entries(targetSchema.properties)) {
    if (propDef.type === 'Association') {
      const assoc = propDef as AssociationDefinition;
      if (assoc.relation === 'ManyToOne' && assoc.target === currentSchemaName) {
        return propName;
      }
    }
  }

  return null;
}

/**
 * Generate relation method.
 */
function generateRelation(
  propName: string,
  assoc: AssociationDefinition,
  schema: LoadedSchema,
  schemas: SchemaCollection,
  options: ResolvedOptions
): string {
  const methodName = toCamelCase(propName);
  const targetClass = assoc.target ? toPascalCase(assoc.target) : '';
  const fkName = toSnakeCase(propName) + '_id';

  switch (assoc.relation) {
    case 'ManyToOne':
      return `    /**
     * Get the ${propName} that owns this model.
     */
    public function ${methodName}(): BelongsTo
    {
        return $this->belongsTo(${targetClass}::class, '${fkName}');
    }`;

    case 'OneToOne':
      if (assoc.mappedBy) {
        return `    /**
     * Get the ${propName} for this model.
     */
    public function ${methodName}(): HasOne
    {
        return $this->hasOne(${targetClass}::class, '${toSnakeCase(assoc.mappedBy)}_id');
    }`;
      }
      return `    /**
     * Get the ${propName} that owns this model.
     */
    public function ${methodName}(): BelongsTo
    {
        return $this->belongsTo(${targetClass}::class, '${fkName}');
    }`;

    case 'OneToMany': {
      // Find the inverse ManyToOne relationship on target to determine correct FK
      let foreignKey: string;
      if (assoc.inversedBy) {
        // If inversedBy is specified, use it
        foreignKey = toSnakeCase(assoc.inversedBy) + '_id';
      } else if (assoc.target) {
        // Look up the inverse relationship on the target schema
        const inverseRelation = findInverseRelation(schema.name, assoc.target, schemas);
        if (inverseRelation) {
          foreignKey = toSnakeCase(inverseRelation) + '_id';
        } else {
          // Fallback: use the current schema name as snake_case + _id
          foreignKey = toSnakeCase(schema.name) + '_id';
        }
      } else {
        foreignKey = toSnakeCase(propName) + '_id';
      }
      return `    /**
     * Get the ${propName} for this model.
     */
    public function ${methodName}(): HasMany
    {
        return $this->hasMany(${targetClass}::class, '${foreignKey}');
    }`;
    }

    case 'ManyToMany': {
      const pivotTable = assoc.joinTable ?? `${toSnakeCase(propName)}_pivot`;

      // Generate withPivot() for pivot fields
      // First check this side's pivotFields, then check the inverse side if mappedBy is specified
      let pivotFieldNames: string[] = [];

      if (assoc.pivotFields && Object.keys(assoc.pivotFields).length > 0) {
        // This is the owning side with pivotFields defined
        pivotFieldNames = Object.keys(assoc.pivotFields).map(f => toSnakeCase(f));
      } else if (assoc.mappedBy && assoc.target) {
        // This is the inverse side - look up pivotFields from the owning side
        const targetSchema = schemas[assoc.target];
        if (targetSchema?.properties) {
          const owningProp = targetSchema.properties[assoc.mappedBy];
          if (owningProp?.type === 'Association') {
            const owningAssoc = owningProp as AssociationDefinition;
            if (owningAssoc.pivotFields && Object.keys(owningAssoc.pivotFields).length > 0) {
              pivotFieldNames = Object.keys(owningAssoc.pivotFields).map(f => toSnakeCase(f));
            }
          }
        }
      }

      const pivotFieldsCode = pivotFieldNames.length > 0
        ? pivotFieldNames.map(f => `'${f}'`).join(', ')
        : null;

      const withPivotLine = pivotFieldsCode
        ? `\n            ->withPivot(${pivotFieldsCode})`
        : '';

      return `    /**
     * The ${propName} that belong to this model.
     */
    public function ${methodName}(): BelongsToMany
    {
        return $this->belongsToMany(${targetClass}::class, '${pivotTable}')${withPivotLine}
            ->withTimestamps();
    }`;
    }

    case 'MorphTo':
      return `    /**
     * Get the parent ${propName} model.
     */
    public function ${methodName}(): MorphTo
    {
        return $this->morphTo('${methodName}');
    }`;

    case 'MorphOne':
      return `    /**
     * Get the ${propName} for this model.
     */
    public function ${methodName}(): MorphOne
    {
        return $this->morphOne(${targetClass}::class, '${assoc.morphName ?? propName}');
    }`;

    case 'MorphMany':
      return `    /**
     * Get the ${propName} for this model.
     */
    public function ${methodName}(): MorphMany
    {
        return $this->morphMany(${targetClass}::class, '${assoc.morphName ?? propName}');
    }`;

    default:
      return `    // TODO: Implement ${assoc.relation} relation for ${propName}`;
  }
}

/**
 * Generate file relation method.
 */
function generateFileRelation(propName: string, propDef: { multiple?: boolean }): string {
  const methodName = toCamelCase(propName);
  const relationType = propDef.multiple ? 'MorphMany' : 'MorphOne';
  const relationMethod = propDef.multiple ? 'morphMany' : 'morphOne';

  return `    /**
     * Get the ${propName} file(s) for this model.
     */
    public function ${methodName}(): ${relationType}
    {
        return $this->${relationMethod}(FileUpload::class, 'uploadable')
            ->where('attribute_name', '${propName}');
    }`;
}

/**
 * Generate user model (created once, not overwritten).
 */
function generateEntityModel(
  schema: LoadedSchema,
  options: ResolvedOptions,
  stubContent: string
): GeneratedModel {
  const className = toPascalCase(schema.name);

  const content = stubContent
    .replace(/\{\{BASE_MODEL_NAMESPACE\}\}/g, options.baseModelNamespace)
    .replace(/\{\{MODEL_NAMESPACE\}\}/g, options.modelNamespace)
    .replace(/\{\{CLASS_NAME\}\}/g, className);

  return {
    path: `${options.modelPath}/${className}.php`,
    content,
    type: 'entity',
    overwrite: false, // Never overwrite user models
    schemaName: schema.name,
  };
}

/**
 * Read stub file content.
 */
function getStubContent(stubName: string): string {
  // Stubs are embedded as strings since this runs in Node.js
  const stubs: Record<string, string> = {
    'base-model': `<?php

namespace {{BASE_MODEL_NAMESPACE}};

/**
 * Base model class for all Omnify-generated models.
 * Contains model mapping for polymorphic relations.
 *
 * DO NOT EDIT - This file is auto-generated by Omnify.
 * Any changes will be overwritten on next generation.
 *
 * @generated by @famgia/omnify-laravel
 */

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\Relation;

abstract class {{BASE_MODEL_CLASS}} extends Model
{
    /**
     * Model class map for polymorphic relations.
     */
    protected static array $modelMap = [
{{MODEL_MAP}}
    ];

    /**
     * Boot the model and register morph map.
     */
    protected static function boot(): void
    {
        parent::boot();

        // Register morph map for polymorphic relations
        Relation::enforceMorphMap(static::$modelMap);
    }

    /**
     * Get the model class for a given morph type.
     */
    public static function getModelClass(string $morphType): ?string
    {
        return static::$modelMap[$morphType] ?? null;
    }
}
`,

    'entity-base': `<?php

namespace {{BASE_MODEL_NAMESPACE}};

/**
 * DO NOT EDIT - This file is auto-generated by Omnify.
 * Any changes will be overwritten on next generation.
 *
 * @generated by @famgia/omnify-laravel
 */

use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;
use Illuminate\\Database\\Eloquent\\Relations\\HasOne;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;
use Illuminate\\Database\\Eloquent\\Relations\\MorphTo;
use Illuminate\\Database\\Eloquent\\Relations\\MorphOne;
use Illuminate\\Database\\Eloquent\\Relations\\MorphMany;
use Illuminate\\Database\\Eloquent\\Relations\\MorphToMany;
use Illuminate\\Database\\Eloquent\\Collection as EloquentCollection;
use {{BASE_MODEL_NAMESPACE}}\\Traits\\HasLocalizedDisplayName;
use {{BASE_MODEL_NAMESPACE}}\\Locales\\{{CLASS_NAME}}Locales;
{{IMPORTS}}

{{DOC_COMMENT}}
class {{CLASS_NAME}}BaseModel extends {{BASE_MODEL_CLASS}}
{
    use HasLocalizedDisplayName;
{{TRAITS}}
    /**
     * The table associated with the model.
     */
    protected $table = '{{TABLE_NAME}}';

    /**
     * The primary key for the model.
     */
    protected $primaryKey = '{{PRIMARY_KEY}}';

{{KEY_TYPE}}
{{INCREMENTING}}
    /**
     * Indicates if the model should be timestamped.
     */
    public $timestamps = {{TIMESTAMPS}};

    /**
     * Localized display names for this model.
     *
     * @var array<string, string>
     */
    protected static array $localizedDisplayNames = {{CLASS_NAME}}Locales::DISPLAY_NAMES;

    /**
     * Localized display names for properties.
     *
     * @var array<string, array<string, string>>
     */
    protected static array $localizedPropertyDisplayNames = {{CLASS_NAME}}Locales::PROPERTY_DISPLAY_NAMES;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
{{FILLABLE}}
    ];

    /**
     * The attributes that should be hidden for serialization.
     */
    protected $hidden = [
{{HIDDEN}}
    ];

    /**
     * The accessors to append to the model's array form.
     */
    protected $appends = [
{{APPENDS}}
    ];

    /**
     * Get the attributes that should be cast.
     */
    protected function casts(): array
    {
        return [
{{CASTS}}
        ];
    }

{{RELATIONS}}
}
`,

    'entity-base-auth': `<?php

namespace {{BASE_MODEL_NAMESPACE}};

/**
 * DO NOT EDIT - This file is auto-generated by Omnify.
 * Any changes will be overwritten on next generation.
 *
 * @generated by @famgia/omnify-laravel
 */

use Illuminate\\Foundation\\Auth\\User as Authenticatable;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;
use Illuminate\\Database\\Eloquent\\Relations\\HasOne;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;
use Illuminate\\Database\\Eloquent\\Relations\\MorphTo;
use Illuminate\\Database\\Eloquent\\Relations\\MorphOne;
use Illuminate\\Database\\Eloquent\\Relations\\MorphMany;
use Illuminate\\Database\\Eloquent\\Relations\\MorphToMany;
use Illuminate\\Database\\Eloquent\\Collection as EloquentCollection;
use Illuminate\\Notifications\\Notifiable;
use {{BASE_MODEL_NAMESPACE}}\\Traits\\HasLocalizedDisplayName;
use {{BASE_MODEL_NAMESPACE}}\\Locales\\{{CLASS_NAME}}Locales;
{{IMPORTS}}

{{DOC_COMMENT}}
class {{CLASS_NAME}}BaseModel extends Authenticatable
{
    use Notifiable;
    use HasLocalizedDisplayName;
{{TRAITS}}
    /**
     * The table associated with the model.
     */
    protected $table = '{{TABLE_NAME}}';

    /**
     * The primary key for the model.
     */
    protected $primaryKey = '{{PRIMARY_KEY}}';

{{KEY_TYPE}}
{{INCREMENTING}}
    /**
     * Indicates if the model should be timestamped.
     */
    public $timestamps = {{TIMESTAMPS}};

    /**
     * Localized display names for this model.
     *
     * @var array<string, string>
     */
    protected static array $localizedDisplayNames = {{CLASS_NAME}}Locales::DISPLAY_NAMES;

    /**
     * Localized display names for properties.
     *
     * @var array<string, array<string, string>>
     */
    protected static array $localizedPropertyDisplayNames = {{CLASS_NAME}}Locales::PROPERTY_DISPLAY_NAMES;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
{{FILLABLE}}
    ];

    /**
     * The attributes that should be hidden for serialization.
     */
    protected $hidden = [
{{HIDDEN}}
    ];

    /**
     * The accessors to append to the model's array form.
     */
    protected $appends = [
{{APPENDS}}
    ];

    /**
     * Get the attributes that should be cast.
     */
    protected function casts(): array
    {
        return [
{{CASTS}}
        ];
    }

{{RELATIONS}}
}
`,

    'entity-base-pivot': `<?php

namespace {{BASE_MODEL_NAMESPACE}};

/**
 * ⚠️ DO NOT EDIT THIS FILE! ⚠️
 * このファイルを編集しないでください！
 * KHÔNG ĐƯỢC SỬA FILE NÀY!
 *
 * This is a PIVOT MODEL - auto-generated by Omnify.
 * Any manual changes will be OVERWRITTEN on next generation.
 *
 * @generated by @famgia/omnify-laravel
 */

use Illuminate\\Database\\Eloquent\\Relations\\Pivot;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;
use {{BASE_MODEL_NAMESPACE}}\\Locales\\{{CLASS_NAME}}Locales;
{{IMPORTS}}

{{DOC_COMMENT}}
class {{CLASS_NAME}}BaseModel extends Pivot
{
    use HasLocalizedDisplayName;
{{TRAITS}}
    /**
     * The table associated with the model.
     */
    protected $table = '{{TABLE_NAME}}';

{{INCREMENTING}}
    /**
     * Indicates if the model should be timestamped.
     */
    public $timestamps = {{TIMESTAMPS}};

    /**
     * Localized display names for this model.
     *
     * @var array<string, string>
     */
    protected static array $localizedDisplayNames = {{CLASS_NAME}}Locales::DISPLAY_NAMES;

    /**
     * Localized display names for properties.
     *
     * @var array<string, array<string, string>>
     */
    protected static array $localizedPropertyDisplayNames = {{CLASS_NAME}}Locales::PROPERTY_DISPLAY_NAMES;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
{{FILLABLE}}
    ];

    /**
     * The attributes that should be hidden for serialization.
     */
    protected $hidden = [
{{HIDDEN}}
    ];

    /**
     * Get the attributes that should be cast.
     */
    protected function casts(): array
    {
        return [
{{CASTS}}
        ];
    }

{{RELATIONS}}
}
`,

    'entity': `<?php

namespace {{MODEL_NAMESPACE}};

use {{BASE_MODEL_NAMESPACE}}\\{{CLASS_NAME}}BaseModel;
use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;

/**
 * {{CLASS_NAME}} Model
 *
 * This file is generated once and can be customized.
 * Add your custom methods and logic here.
 */
class {{CLASS_NAME}} extends {{CLASS_NAME}}BaseModel
{
    use HasFactory;

    /**
     * Create a new model instance.
     */
    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);
    }

    // Add your custom methods here
}
`,

    'service-provider': `<?php

namespace App\\Providers;

use Illuminate\\Database\\Eloquent\\Relations\\Relation;
use Illuminate\\Support\\ServiceProvider;

/**
 * Omnify Service Provider
 *
 * DO NOT EDIT - This file is auto-generated by Omnify.
 * Any changes will be overwritten on next generation.
 *
 * - Loads Omnify migrations from database/migrations/omnify
 * - Registers morph map for polymorphic relationships
 *
 * @generated by @famgia/omnify-laravel
 */
class OmnifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Load Omnify migrations from custom directory
        $this->loadMigrationsFrom(database_path('migrations/omnify'));

        // Register morph map for polymorphic relationships
        Relation::enforceMorphMap([
{{MORPH_MAP}}
        ]);
    }
}
`,

    'has-localized-display-name': `<?php

namespace {{BASE_MODEL_NAMESPACE}}\\Traits;

/**
 * Trait for localized display names.
 * Uses Laravel's app()->getLocale() for locale resolution.
 *
 * DO NOT EDIT - This file is auto-generated by Omnify.
 * Any changes will be overwritten on next generation.
 *
 * @generated by @famgia/omnify-laravel
 */
trait HasLocalizedDisplayName
{
    /**
     * Get the localized display name for this model.
     *
     * @param string|null $locale Locale code (defaults to app locale)
     * @return string
     */
    public static function displayName(?string $locale = null): string
    {
        $locale = $locale ?? app()->getLocale();
        $displayNames = static::$localizedDisplayNames ?? [];

        return $displayNames[$locale]
            ?? $displayNames[config('app.fallback_locale', 'en')]
            ?? $displayNames[array_key_first($displayNames) ?? 'en']
            ?? class_basename(static::class);
    }

    /**
     * Get all localized display names for this model.
     *
     * @return array<string, string>
     */
    public static function allDisplayNames(): array
    {
        return static::$localizedDisplayNames ?? [];
    }

    /**
     * Get the localized display name for a property.
     *
     * @param string $property Property name
     * @param string|null $locale Locale code (defaults to app locale)
     * @return string
     */
    public static function propertyDisplayName(string $property, ?string $locale = null): string
    {
        $locale = $locale ?? app()->getLocale();
        $displayNames = static::$localizedPropertyDisplayNames[$property] ?? [];

        return $displayNames[$locale]
            ?? $displayNames[config('app.fallback_locale', 'en')]
            ?? $displayNames[array_key_first($displayNames) ?? 'en']
            ?? $property;
    }

    /**
     * Get all localized display names for a property.
     *
     * @param string $property Property name
     * @return array<string, string>
     */
    public static function allPropertyDisplayNames(string $property): array
    {
        return static::$localizedPropertyDisplayNames[$property] ?? [];
    }

    /**
     * Get all property display names for a given locale.
     *
     * @param string|null $locale Locale code (defaults to app locale)
     * @return array<string, string>
     */
    public static function allPropertyDisplayNamesForLocale(?string $locale = null): array
    {
        $locale = $locale ?? app()->getLocale();
        $result = [];

        foreach (static::$localizedPropertyDisplayNames ?? [] as $property => $displayNames) {
            $result[$property] = $displayNames[$locale]
                ?? $displayNames[config('app.fallback_locale', 'en')]
                ?? $displayNames[array_key_first($displayNames) ?? 'en']
                ?? $property;
        }

        return $result;
    }
}
`,

    'locales': `<?php

namespace {{BASE_MODEL_NAMESPACE}}\\Locales;

/**
 * Localized display names for {{CLASS_NAME}}.
 *
 * DO NOT EDIT - This file is auto-generated by Omnify.
 * Any changes will be overwritten on next generation.
 *
 * @generated by @famgia/omnify-laravel
 */
class {{CLASS_NAME}}Locales
{
    /**
     * Localized display names for the model.
     *
     * @var array<string, string>
     */
    public const DISPLAY_NAMES = [
{{LOCALIZED_DISPLAY_NAMES}}
    ];

    /**
     * Localized display names for properties.
     *
     * @var array<string, array<string, string>>
     */
    public const PROPERTY_DISPLAY_NAMES = [
{{LOCALIZED_PROPERTY_DISPLAY_NAMES}}
    ];
}
`,

  };

  return stubs[stubName] ?? '';
}

/**
 * Generate OmnifyServiceProvider with morph map.
 */
function generateServiceProvider(
  schemas: SchemaCollection,
  options: ResolvedOptions,
  stubContent: string
): GeneratedModel {
  // Build morph map - only include models (not enums, partials, hidden, or external package schemas)
  // External packages should handle their own morph maps via their ServiceProviders
  const morphMap = Object.values(schemas)
    .filter(s =>
      s.kind !== 'enum' &&
      s.kind !== 'partial' &&
      s.options?.hidden !== true &&
      !s.packageOutput // Skip schemas from external packages (additionalSchemaPaths)
    )
    .map(s => {
      const className = toPascalCase(s.name);
      return `            '${s.name}' => \\${options.modelNamespace}\\${className}::class,`;
    })
    .join('\n');

  const content = stubContent
    .replace(/\{\{MORPH_MAP\}\}/g, morphMap);

  return {
    path: `${options.providersPath}/OmnifyServiceProvider.php`,
    content,
    type: 'service-provider',
    overwrite: true, // Always overwrite to keep morph map in sync
    schemaName: '__service_provider__',
  };
}

/**
 * パッケージ用のServiceProviderを生成
 * composer.jsonのextra.laravel.providersで自動発見される
 */
function generatePackageServiceProvider(
  schemas: SchemaCollection,
  options: ResolvedOptions,
  packageBase: string,
  stubContent: string
): GeneratedModel {
  // パッケージ名からServiceProvider名を導出 (e.g., 'Omnify\\SsoClient' → 'SsoClientServiceProvider')
  const baseNs = options.modelNamespace.replace(/\\Models$/, '');
  const nsParts = baseNs.split('\\');
  const packageName = nsParts[nsParts.length - 1]; // 最後の部分を取得
  const providerName = `${packageName}ServiceProvider`;
  const providerNamespace = `${baseNs}\\Providers`;

  // Build morph map for this package's schemas only
  const morphMap = Object.values(schemas)
    .filter(s => s.kind !== 'enum' && s.kind !== 'partial' && s.options?.hidden !== true)
    .map(s => {
      const className = toPascalCase(s.name);
      return `            '${s.name}' => \\${options.modelNamespace}\\${className}::class,`;
    })
    .join('\n');

  // パッケージ用のServiceProviderテンプレート
  const content = `<?php

namespace ${providerNamespace};

use Illuminate\\Database\\Eloquent\\Relations\\Relation;
use Illuminate\\Support\\ServiceProvider;

/**
 * ${packageName} Service Provider
 *
 * This provider is auto-generated by Omnify.
 * Register it in composer.json extra.laravel.providers for auto-discovery.
 */
class ${providerName} extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        // Load migrations from package
        $this->loadMigrationsFrom(__DIR__ . '/../../database/migrations');

        // Enforce morph map for this package's models
        Relation::enforceMorphMap([
${morphMap}
        ]);
    }
}
`;

  return {
    path: `${options.providersPath}/${providerName}.php`,
    content,
    type: 'service-provider',
    overwrite: true,
    schemaName: `__package_service_provider__${packageName}`,
  };
}

/**
 * パッケージ用のBaseModelを生成
 */
function generatePackageBaseModel(
  schemas: Record<string, LoadedSchema>,
  options: ResolvedOptions,
  stubContent: string
): GeneratedModel {
  // Build model map for this package only
  const modelMap = Object.values(schemas)
    .filter(s => s.kind !== 'enum' && s.kind !== 'partial')
    .map(s => {
      const className = toPascalCase(s.name);
      return `        '${s.name}' => \\${options.modelNamespace}\\${className}::class,`;
    })
    .join('\n');

  const content = stubContent
    .replace(/\{\{BASE_MODEL_NAMESPACE\}\}/g, options.baseModelNamespace)
    .replace(/\{\{BASE_MODEL_CLASS\}\}/g, 'BaseModel')
    .replace(/\{\{MODEL_MAP\}\}/g, modelMap);

  return {
    path: `${options.baseModelPath}/BaseModel.php`,
    content,
    type: 'base-model',
    overwrite: true,
    schemaName: '__package_base_model__',
  };
}

/**
 * パッケージ用のHasLocalizedDisplayName traitを生成
 */
function generatePackageTrait(
  options: ResolvedOptions,
  stubContent: string
): GeneratedModel {
  const content = stubContent
    .replace(/\{\{BASE_MODEL_NAMESPACE\}\}/g, options.baseModelNamespace);

  return {
    path: `${options.baseModelPath}/Traits/HasLocalizedDisplayName.php`,
    content,
    type: 'trait',
    overwrite: true,
    schemaName: '__package_trait__',
  };
}

/**
 * Generate the HasLocalizedDisplayName trait.
 */
function generateLocalizedDisplayNameTrait(
  options: ResolvedOptions,
  stubContent: string
): GeneratedModel {
  const content = stubContent
    .replace(/\{\{BASE_MODEL_NAMESPACE\}\}/g, options.baseModelNamespace);

  return {
    path: `${options.baseModelPath}/Traits/HasLocalizedDisplayName.php`,
    content,
    type: 'trait',
    overwrite: true, // Always overwrite trait
    schemaName: '__trait__',
  };
}


/**
 * Generate the Locales class for a schema.
 */
function generateLocalesClass(
  schema: LoadedSchema,
  options: ResolvedOptions,
  stubContent: string
): GeneratedModel {
  const className = toPascalCase(schema.name);

  // Generate localized display names
  const localizedDisplayNames = generateLocalizedDisplayNames(schema.displayName);
  const localizedPropertyDisplayNames = generatePropertyLocalizedDisplayNames(schema);

  const content = stubContent
    .replace(/\{\{BASE_MODEL_NAMESPACE\}\}/g, options.baseModelNamespace)
    .replace(/\{\{CLASS_NAME\}\}/g, className)
    .replace(/\{\{LOCALIZED_DISPLAY_NAMES\}\}/g, localizedDisplayNames)
    .replace(/\{\{LOCALIZED_PROPERTY_DISPLAY_NAMES\}\}/g, localizedPropertyDisplayNames);

  return {
    path: `${options.baseModelPath}/Locales/${className}Locales.php`,
    content,
    type: 'locales',
    overwrite: true, // Always overwrite locales
    schemaName: schema.name,
  };
}

/**
 * Generate all models for the given schemas.
 */
export function generateModels(
  schemas: SchemaCollection,
  options?: ModelGeneratorOptions
): GeneratedModel[] {
  const globalResolved = resolveOptions(options);
  const models: GeneratedModel[] = [];

  // メインプロジェクト用のスキーマとパッケージ用のスキーマを分離
  const mainSchemas: Record<string, LoadedSchema> = {};
  const packageSchemaGroups = new Map<string, { schemas: Record<string, LoadedSchema>; resolved: ResolvedOptions }>();

  for (const [name, schema] of Object.entries(schemas)) {
    if (schema.packageOutput?.laravel) {
      const base = schema.packageOutput.laravel.base;
      if (!packageSchemaGroups.has(base)) {
        packageSchemaGroups.set(base, {
          schemas: {},
          resolved: resolveSchemaOptions(schema, globalResolved),
        });
      }
      packageSchemaGroups.get(base)!.schemas[name] = schema;
    } else {
      mainSchemas[name] = schema;
    }
  }

  // メインプロジェクト用の共有ファイルを生成
  // Generate shared base model
  models.push(generateBaseModel(schemas, globalResolved, getStubContent('base-model')));

  // Generate HasLocalizedDisplayName trait in Traits subfolder
  models.push(generateLocalizedDisplayNameTrait(globalResolved, getStubContent('has-localized-display-name')));

  // Generate OmnifyServiceProvider with morph map (for main project only, includes all schemas)
  models.push(generateServiceProvider(schemas, globalResolved, getStubContent('service-provider')));

  // Generate models for each schema (excluding enums, partials, and hidden schemas)
  for (const schema of Object.values(schemas)) {
    // Skip enum and partial schemas (they don't generate models)
    if (schema.kind === 'enum' || schema.kind === 'partial') {
      continue;
    }

    // Skip hidden schemas (e.g., cache, jobs, sessions)
    if (schema.options?.hidden === true) {
      continue;
    }

    // スキーマごとのオプションを解決
    const schemaResolved = resolveSchemaOptions(schema, globalResolved);

    // Generate Locales class in Locales subfolder
    models.push(generateLocalesClass(schema, schemaResolved, getStubContent('locales')));

    // Generate entity base model (always overwritten)
    // Pivot schemas also generate models (extending Pivot class)
    models.push(generateEntityBaseModel(
      schema,
      schemas,
      schemaResolved,
      getStubContent('entity-base'),
      getStubContent('entity-base-auth'),
      getStubContent('entity-base-pivot')
    ));

    // Generate user model (created once)
    models.push(generateEntityModel(schema, schemaResolved, getStubContent('entity')));
  }

  // パッケージごとにBaseModel, Trait, ServiceProviderを生成
  for (const [base, { schemas: pkgSchemas, resolved: pkgResolved }] of packageSchemaGroups) {
    // Generate package BaseModel
    models.push(generatePackageBaseModel(pkgSchemas, pkgResolved, getStubContent('base-model')));

    // Generate package HasLocalizedDisplayName trait
    models.push(generatePackageTrait(pkgResolved, getStubContent('has-localized-display-name')));

    // Generate package ServiceProvider
    models.push(generatePackageServiceProvider(pkgSchemas, pkgResolved, base, getStubContent('service-provider')));
  }

  return models;
}

/**
 * Get the output path for a model.
 */
export function getModelPath(model: GeneratedModel): string {
  return model.path;
}

/**
 * Generate provider registration for Laravel.
 * Handles both Laravel 11+ (bootstrap/providers.php) and Laravel 10- (config/app.php).
 *
 * @param existingContent - Existing file content (null if file doesn't exist)
 * @param laravelVersion - Laravel version type
 * @param laravelRoot - Laravel root directory (e.g., "./backend" or "")
 * @returns Registration result or null if already registered
 */
export function generateProviderRegistration(
  existingContent: string | null,
  laravelVersion: 'laravel11+' | 'laravel10-',
  laravelRoot: string = ''
): ProviderRegistrationResult | null {
  const providerClass = 'App\\Providers\\OmnifyServiceProvider::class';
  const providerLine = `    ${providerClass},`;

  // Build paths with Laravel root prefix
  const bootstrapPath = laravelRoot ? `${laravelRoot}/bootstrap/providers.php` : 'bootstrap/providers.php';
  const configPath = laravelRoot ? `${laravelRoot}/config/app.php` : 'config/app.php';

  // Check if already registered
  if (existingContent && existingContent.includes('OmnifyServiceProvider')) {
    return {
      path: laravelVersion === 'laravel11+' ? bootstrapPath : configPath,
      content: existingContent,
      laravelVersion,
      alreadyRegistered: true,
    };
  }

  if (laravelVersion === 'laravel11+') {
    // Laravel 11+ uses bootstrap/providers.php
    if (existingContent) {
      // Find the closing bracket of the array and insert before it
      const lines = existingContent.split('\n');
      const result: string[] = [];
      let inserted = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Find the closing ];
        if (!inserted && line.trim() === '];') {
          // Insert before closing bracket
          result.push(providerLine);
          inserted = true;
        }
        result.push(line);
      }

      return {
        path: bootstrapPath,
        content: result.join('\n'),
        laravelVersion,
        alreadyRegistered: false,
      };
    } else {
      // Create new file
      return {
        path: bootstrapPath,
        content: `<?php

return [
    App\\Providers\\AppServiceProvider::class,
${providerLine}
];
`,
        laravelVersion,
        alreadyRegistered: false,
      };
    }
  } else {
    // Laravel 10- uses config/app.php
    if (existingContent) {
      // Find 'providers' => [...] and insert OmnifyServiceProvider
      // This is more complex because config/app.php has multiple arrays

      // Look for the providers array closing
      // Pattern: After "App\Providers\..." look for the next line with ], and insert before
      const providersSectionRegex = /'providers'\s*=>\s*\[[\s\S]*?\n(\s*)\]/m;
      const match = existingContent.match(providersSectionRegex);

      if (match) {
        // Find position to insert - before the closing ]
        const providersStart = existingContent.indexOf("'providers'");
        if (providersStart === -1) {
          return null; // Can't find providers section
        }

        // Find the closing ] of providers array
        let depth = 0;
        let foundStart = false;
        let insertPos = -1;

        for (let i = providersStart; i < existingContent.length; i++) {
          const char = existingContent[i];
          if (char === '[') {
            foundStart = true;
            depth++;
          } else if (char === ']') {
            depth--;
            if (foundStart && depth === 0) {
              insertPos = i;
              break;
            }
          }
        }

        if (insertPos !== -1) {
          // Find the last provider line before closing ]
          const beforeClose = existingContent.substring(0, insertPos);
          const lastNewline = beforeClose.lastIndexOf('\n');

          // Insert after last provider, before ]
          const content =
            existingContent.substring(0, lastNewline + 1) +
            providerLine + '\n' +
            existingContent.substring(lastNewline + 1);

          return {
            path: configPath,
            content,
            laravelVersion,
            alreadyRegistered: false,
          };
        }
      }

      return null; // Couldn't parse config/app.php
    } else {
      // Can't create config/app.php from scratch - it's too complex
      return null;
    }
  }
}
