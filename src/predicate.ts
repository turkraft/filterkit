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

function getFieldValue(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function likeToRegex(pattern: string): RegExp {
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
  return new RegExp('^' + regex + '$', 's');
}

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasSize(val: unknown): val is { size: number } {
  return val != null && typeof val === 'object' && 'size' in val && typeof (val as any).size === 'number';
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (hasSize(value)) return value.size === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

export function createPredicate(node: FilterNode): EvalFn {
  if (node instanceof FieldNode) {
    return (obj) => getFieldValue(obj, node.getName());
  }

  if (node instanceof InputNode) {
    const value = node.getValue();
    return () => value;
  }

  if (node instanceof PriorityNode) {
    return createPredicate(node.getNode());
  }

  if (node instanceof PrefixOperationNode) {
    const right = createPredicate(node.getRight());
    const op = node.getOperator();
    if (op instanceof NotOperator) {
      return (obj) => !right(obj);
    }
    throw new Error(`Unsupported prefix operator: ${op.getToken()}`);
  }

  if (node instanceof PostfixOperationNode) {
    const left = createPredicate(node.getLeft());
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
    const left = createPredicate(node.getLeft());
    const right = createPredicate(node.getRight());
    const op = node.getOperator();

    if (op instanceof AndOperator) {
      return (obj) => left(obj) && right(obj);
    }
    if (op instanceof OrOperator) {
      return (obj) => left(obj) || right(obj);
    }
    if (op instanceof XorOperator) {
      return (obj) => (left(obj) ? 1 : 0) !== (right(obj) ? 1 : 0);
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
    if (op instanceof LikeOperator) {
      return (obj) => {
        const lv = left(obj);
        const rv = right(obj);
        if (lv == null || rv == null) return false;
        return likeToRegex(String(rv)).test(String(lv));
      };
    }
    if (op instanceof InsensitiveLikeOperator) {
      return (obj) => {
        const lv = left(obj);
        const rv = right(obj);
        if (lv == null || rv == null) return false;
        return likeToRegex(String(rv)).test(String(lv).toLowerCase());
      };
    }
    if (op instanceof InOperator) {
      return (obj) => {
        const lv = left(obj);
        const coll = right(obj);
        if (Array.isArray(coll)) {
          return coll.some((item) => areEqual(lv, item));
        }
        return areEqual(lv, coll);
      };
    }
    if (op instanceof NotInOperator) {
      return (obj) => {
        const lv = left(obj);
        const coll = right(obj);
        if (Array.isArray(coll)) {
          return !coll.some((item) => areEqual(lv, item));
        }
        return !areEqual(lv, coll);
      };
    }
    throw new Error(`Unsupported infix operator: ${op.getToken()}`);
  }

  if (node instanceof CollectionNode) {
    const preds = node.getItems().map(createPredicate);
    return (obj) => preds.map((p) => p(obj)) as any;
  }

  if (node instanceof CollectionLikeNode) {
    const leftPred = createPredicate(node.getLeft());
    const patternPreds = node.getPatterns().map(createPredicate);
    return (obj) => {
      const val = String(leftPred(obj) ?? '');
      return patternPreds.some((p) => {
        const pattern = String(p(obj));
        return likeToRegex(pattern).test(val);
      });
    };
  }

  if (node instanceof FunctionNode) {
    const argPreds = node.getArguments().map(createPredicate);
    const name = node.getFunction().getName();
    if (name === 'size') {
      return (obj) => {
        if (argPreds.length === 0) return 0;
        const val = argPreds[0](obj);
        if (val == null) return 0;
        if (typeof val === 'string' || Array.isArray(val)) return (val as any).length;
        if (hasSize(val)) return val.size;
        if (typeof val === 'object') return Object.keys(val as object).length;
        return 0;
      };
    }
    throw new Error(`Unsupported function: ${name}`);
  }

  if (node instanceof PlaceholderNode) {
    return () => {
      throw new Error(`Placeholder \`${node.getPlaceholder().getName()}\` has no value. Set via placeholder resolver.`);
    };
  }

  throw new Error(`Unsupported node type: ${node.constructor.name}`);
}

function areEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  return a === b;
}

function compare(a: unknown, b: unknown): number {
  if (a == null || b == null) return NaN;
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

export function filter<T>(data: T[], node: FilterNode): T[] {
  const pred = createPredicate(node);
  return data.filter(item => !!pred(item));
}
