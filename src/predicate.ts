import {
  FilterNode,
  FieldNode,
  InputNode,
  InfixOperationNode,
  PrefixOperationNode,
  PostfixOperationNode,
  PriorityNode,
  CollectionNode,
  CollectionLikeNode,
  FunctionNode,
  PlaceholderNode,
} from './nodes.js';
import {
  EqualOperator,
  NotEqualOperator,
  GreaterThanOperator,
  GreaterThanOrEqualOperator,
  LessThanOperator,
  LessThanOrEqualOperator,
  LikeOperator,
  InsensitiveLikeOperator,
  InOperator,
  NotInOperator,
  AndOperator,
  OrOperator,
  XorOperator,
  NotOperator,
  IsNullOperator,
  IsNotNullOperator,
  IsEmptyOperator,
  IsNotEmptyOperator,
} from './operators.js';

type EvalFn<T = unknown> = (obj: T) => any;

export interface PredicateOptions {
  placeholders?: Record<string, unknown>;
  functions?: Record<string, (args: unknown[]) => unknown>;
}

const BLOCKED_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);

function getFieldValue(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    if (BLOCKED_PROPERTIES.has(part)) return undefined;
    current = current[part];
  }
  return current;
}

function likeToRegex(pattern: string, caseInsensitive = false): RegExp {
  let regex = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '%') {
      regex += '.*';
      i++;
    } else if (ch === '_') {
      regex += '.';
      i++;
    } else if (ch === '\\') {
      if (i + 1 < pattern.length) {
        const next = pattern[i + 1];
        if (next === '%' || next === '_') {
          regex += escapeRegex(next);
          i += 2;
        } else {
          regex += '\\\\';
          i++;
        }
      } else {
        regex += '\\\\';
        i++;
      }
    } else {
      regex += escapeRegex(ch);
      i++;
    }
  }
  return new RegExp('^' + regex + '$', caseInsensitive ? 'si' : 's');
}

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasSize(val: unknown): val is { size: number } {
  return val != null && typeof val === 'object' && 'size' in val && typeof (val as any).size === 'number';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (hasSize(value)) return value.size === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function sizeOf(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string' || Array.isArray(value)) return (value as any).length;
  if (hasSize(value)) return value.size;
  if (isPlainObject(value)) return Object.keys(value).length;
  return 0;
}

function matchesAnyPattern(
  value: unknown,
  patterns: EvalFn[],
  obj: unknown,
  caseInsensitive: boolean
): boolean {
  if (value == null) return false;
  const text = String(value);
  return patterns.some((p) => {
    const pattern = p(obj);
    if (pattern == null) return false;
    return likeToRegex(String(pattern), caseInsensitive).test(text);
  });
}

function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function createPredicate(node: FilterNode, options: PredicateOptions = {}): EvalFn {
  if (node instanceof FieldNode) {
    return (obj) => getFieldValue(obj, node.getName());
  }

  if (node instanceof InputNode) {
    const value = node.getValue();
    return () => value;
  }

  if (node instanceof PriorityNode) {
    return createPredicate(node.getNode(), options);
  }

  if (node instanceof PrefixOperationNode) {
    const right = createPredicate(node.getRight(), options);
    const op = node.getOperator();
    if (op instanceof NotOperator) {
      return (obj) => !truthy(right(obj));
    }
    throw new Error(`Unsupported prefix operator: ${op.getToken()}`);
  }

  if (node instanceof PostfixOperationNode) {
    const left = createPredicate(node.getLeft(), options);
    const op = node.getOperator();
    if (op instanceof IsNullOperator) {
      return (obj) => left(obj) == null;
    }
    if (op instanceof IsNotNullOperator) {
      return (obj) => left(obj) != null;
    }
    if (op instanceof IsEmptyOperator) {
      return (obj) => isEmpty(left(obj));
    }
    if (op instanceof IsNotEmptyOperator) {
      return (obj) => !isEmpty(left(obj));
    }
    throw new Error(`Unsupported postfix operator: ${op.getToken()}`);
  }

  if (node instanceof InfixOperationNode) {
    const left = createPredicate(node.getLeft(), options);
    const right = createPredicate(node.getRight(), options);
    const op = node.getOperator();

    if (op instanceof AndOperator) {
      return (obj) => truthy(left(obj)) && truthy(right(obj));
    }
    if (op instanceof OrOperator) {
      return (obj) => truthy(left(obj)) || truthy(right(obj));
    }
    if (op instanceof XorOperator) {
      return (obj) => truthy(left(obj)) !== truthy(right(obj));
    }
    if (op instanceof EqualOperator) {
      return (obj) => areEqual(left(obj), right(obj));
    }
    if (op instanceof NotEqualOperator) {
      return (obj) => !areEqual(left(obj), right(obj));
    }
    if (op instanceof GreaterThanOperator) {
      return (obj) => compare(left(obj), right(obj)) > 0;
    }
    if (op instanceof GreaterThanOrEqualOperator) {
      return (obj) => compare(left(obj), right(obj)) >= 0;
    }
    if (op instanceof LessThanOperator) {
      return (obj) => compare(left(obj), right(obj)) < 0;
    }
    if (op instanceof LessThanOrEqualOperator) {
      return (obj) => compare(left(obj), right(obj)) <= 0;
    }
    if (op instanceof LikeOperator || op instanceof InsensitiveLikeOperator) {
      const caseInsensitive = op instanceof InsensitiveLikeOperator;
      if (node.getRight() instanceof CollectionNode) {
        const patterns = (node.getRight() as CollectionNode).getItems()
          .map((p) => createPredicate(p, options));
        return (obj) => matchesAnyPattern(left(obj), patterns, obj, caseInsensitive);
      }
      return (obj) => {
        const lv = left(obj);
        const rv = right(obj);
        if (lv == null || rv == null) return false;
        return likeToRegex(String(rv), caseInsensitive).test(String(lv));
      };
    }
    if (op instanceof InOperator || op instanceof NotInOperator) {
      const negated = op instanceof NotInOperator;
      return (obj) => {
        const lv = left(obj);
        const coll = right(obj);
        const found = Array.isArray(coll)
          ? coll.some((item) => areEqual(lv, item))
          : areEqual(lv, coll);
        return negated ? !found : found;
      };
    }
    throw new Error(`Unsupported infix operator: ${op.getToken()}`);
  }

  if (node instanceof CollectionNode) {
    const preds = node.getItems().map((item) => createPredicate(item, options));
    return (obj) => preds.map((p) => p(obj)) as any;
  }

  if (node instanceof CollectionLikeNode) {
    const leftPred = createPredicate(node.getLeft(), options);
    const patternPreds = node.getPatterns().map((p) => createPredicate(p, options));
    const caseInsensitive = node.getOperator() instanceof InsensitiveLikeOperator;
    return (obj) => matchesAnyPattern(leftPred(obj), patternPreds, obj, caseInsensitive);
  }

  if (node instanceof FunctionNode) {
    const argPreds = node.getArguments().map((a) => createPredicate(a, options));
    const name = node.getFunction().getName();

    const custom = options.functions?.[name];
    if (custom) {
      return (obj) => custom(argPreds.map((p) => p(obj)));
    }
    if (name === 'size') {
      return (obj) => (argPreds.length === 0 ? 0 : sizeOf(argPreds[0](obj)));
    }
    if (name === 'today') {
      return () => today();
    }
    throw new Error(
      `Unsupported function: ${name}. Provide an implementation via the \`functions\` option.`
    );
  }

  if (node instanceof PlaceholderNode) {
    const name = node.getPlaceholder().getName();
    if (options.placeholders && Object.prototype.hasOwnProperty.call(options.placeholders, name)) {
      const value = options.placeholders[name];
      return () => value;
    }
    return () => {
      throw new Error(
        `Placeholder \`${name}\` has no value. Provide one via the \`placeholders\` option.`
      );
    };
  }

  throw new Error(`Unsupported node type: ${node.constructor.name}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function toTime(value: unknown, epochNumbers = false): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return isNaN(t) ? null : t;
  }
  if (typeof value === 'string' && ISO_DATE.test(value.trim())) {
    const t = Date.parse(value.trim());
    return isNaN(t) ? null : t;
  }
  if (epochNumbers && typeof value === 'number' && !isNaN(value)) return value;
  return null;
}

function eitherIsDate(a: unknown, b: unknown): boolean {
  return a instanceof Date || b instanceof Date;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return isNaN(n) ? null : n;
  }
  return null;
}

function areEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a === b) return true;

  const epochNumbers = eitherIsDate(a, b);
  const ta = toTime(a, epochNumbers);
  const tb = toTime(b, epochNumbers);
  if (ta !== null && tb !== null) return ta === tb;
  if (epochNumbers) return false;

  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return toBooleanForComparison(a) === toBooleanForComparison(b);
  }

  if (typeof a === 'number' || typeof b === 'number') {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na !== null && nb !== null) return na === nb;
    return false;
  }

  return false;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return null;
}

const TRUE_WORDS = new Set(['true', 'on', 'yes']);
const FALSE_WORDS = new Set(['false', 'off', 'no']);

function toBooleanForComparison(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (TRUE_WORDS.has(lower)) return true;
    if (FALSE_WORDS.has(lower)) return false;
  }
  return null;
}

function truthy(value: unknown): boolean {
  const asBoolean = toBoolean(value);
  return asBoolean !== null ? asBoolean : !!value;
}

function compare(a: unknown, b: unknown): number {
  if (a == null || b == null) return NaN;

  const epochNumbers = eitherIsDate(a, b);
  const ta = toTime(a, epochNumbers);
  const tb = toTime(b, epochNumbers);
  if (ta !== null && tb !== null) return ta - tb;
  if (epochNumbers) return NaN;

  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const ba = toBooleanForComparison(a);
    const bb = toBooleanForComparison(b);
    if (ba !== null && bb !== null) return (ba ? 1 : 0) - (bb ? 1 : 0);
    return NaN;
  }

  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;

  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function filter<T>(data: T[], node: FilterNode, options?: PredicateOptions): T[] {
  const pred = createPredicate(node, options);
  return data.filter(item => truthy(pred(item)));
}

export function isMatch(pred: (obj: unknown) => unknown, obj: unknown): boolean {
  return truthy(pred(obj));
}
