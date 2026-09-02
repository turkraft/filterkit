import {
  FilterInfixOperator,
  FilterPrefixOperator,
  FilterPostfixOperator,
  FilterFunction,
  FilterPlaceholder,
  FilterOperator,
} from './nodes.js';

export class EqualOperator extends FilterInfixOperator {
  constructor() { super([':', '='], 100); }
}

export class NotEqualOperator extends FilterInfixOperator {
  constructor() { super(['!', '<>'], 100); }
}

export class GreaterThanOperator extends FilterInfixOperator {
  constructor() { super('>', 100); }
}

export class GreaterThanOrEqualOperator extends FilterInfixOperator {
  constructor() { super(['>:', '>='], 100); }
}

export class LessThanOperator extends FilterInfixOperator {
  constructor() { super('<', 100); }
}

export class LessThanOrEqualOperator extends FilterInfixOperator {
  constructor() { super(['<:', '<='], 100); }
}

export class LikeOperator extends FilterInfixOperator {
  constructor() { super(['~', 'like'], 100); }
}

export class InsensitiveLikeOperator extends FilterInfixOperator {
  constructor() { super(['~~', 'ilike'], 100); }
}

export class InOperator extends FilterInfixOperator {
  constructor() { super('in', 100); }
}

export class NotInOperator extends FilterInfixOperator {
  constructor() { super('not in', 100); }
}

export class AndOperator extends FilterInfixOperator {
  constructor() { super('and', 50); }
}

export class OrOperator extends FilterInfixOperator {
  constructor() { super('or', 25); }
}

export class XorOperator extends FilterInfixOperator {
  constructor() { super('xor', 25); }
}

export class NotOperator extends FilterPrefixOperator {
  constructor() { super('not', 75); }
}

export class IsNullOperator extends FilterPostfixOperator {
  constructor() { super('is null', 100); }
}

export class IsNotNullOperator extends FilterPostfixOperator {
  constructor() { super('is not null', 100); }
}

export class IsEmptyOperator extends FilterPostfixOperator {
  constructor() { super('is empty', 100); }
}

export class IsNotEmptyOperator extends FilterPostfixOperator {
  constructor() { super('is not empty', 100); }
}

export class SizeFunction extends FilterFunction {
  constructor() { super('size'); }
}

export class TodayFunction extends FilterFunction {
  constructor() { super('today'); }
}

export class HelloWorldPlaceholder extends FilterPlaceholder {
  constructor() { super('hello'); }
}

export type OperatorToken = {
  operator: FilterOperator;
  token: string;
};

export interface FilterOperators {
  getPrefixOperators(): FilterPrefixOperator[];
  getInfixOperators(): FilterInfixOperator[];
  getPostfixOperators(): FilterPostfixOperator[];

  getPrefixOperator(token: string): FilterPrefixOperator;
  getInfixOperator(token: string): FilterInfixOperator;
  getPostfixOperator(token: string): FilterPostfixOperator;

  getPrefixOperatorByType<T extends FilterPrefixOperator>(type: new (...args: any[]) => T): T;
  getInfixOperatorByType<T extends FilterInfixOperator>(type: new (...args: any[]) => T): T;
  getPostfixOperatorByType<T extends FilterPostfixOperator>(type: new (...args: any[]) => T): T;

  getSortedOperators(): OperatorToken[];
}

export class FilterOperatorsImpl implements FilterOperators {
  private readonly prefixOperators: FilterPrefixOperator[];
  private readonly infixOperators: FilterInfixOperator[];
  private readonly postfixOperators: FilterPostfixOperator[];
  private readonly sortedOperators: OperatorToken[];

  constructor(
    prefix: FilterPrefixOperator[],
    infix: FilterInfixOperator[],
    postfix: FilterPostfixOperator[]
  ) {
    this.prefixOperators = Object.freeze([...prefix]) as FilterPrefixOperator[];
    this.infixOperators = Object.freeze([...infix]) as FilterInfixOperator[];
    this.postfixOperators = Object.freeze([...postfix]) as FilterPostfixOperator[];

    this.sortedOperators = [];
    for (const op of this.prefixOperators) {
      for (const t of op.getTokens()) {
        this.sortedOperators.push({ operator: op, token: t.toLowerCase() });
      }
    }
    for (const op of this.infixOperators) {
      for (const t of op.getTokens()) {
        this.sortedOperators.push({ operator: op, token: t.toLowerCase() });
      }
    }
    for (const op of this.postfixOperators) {
      for (const t of op.getTokens()) {
        this.sortedOperators.push({ operator: op, token: t.toLowerCase() });
      }
    }
    this.sortedOperators.sort((a, b) => {
      const p = b.operator.getPriority() - a.operator.getPriority();
      if (p !== 0) return p;
      return b.token.length - a.token.length;
    });
    Object.freeze(this.sortedOperators);
  }

  getPrefixOperators(): FilterPrefixOperator[] { return this.prefixOperators; }
  getInfixOperators(): FilterInfixOperator[] { return this.infixOperators; }
  getPostfixOperators(): FilterPostfixOperator[] { return this.postfixOperators; }

  getPrefixOperator(token: string): FilterPrefixOperator {
    const lower = token.toLowerCase();
    for (const op of this.prefixOperators) {
      for (const t of op.getTokens()) {
        if (t.toLowerCase() === lower) return op;
      }
    }
    throw new Error(`Unrecognized prefix operator \`${token}\``);
  }

  getInfixOperator(token: string): FilterInfixOperator {
    const lower = token.toLowerCase();
    for (const op of this.infixOperators) {
      for (const t of op.getTokens()) {
        if (t.toLowerCase() === lower) return op;
      }
    }
    throw new Error(`Unrecognized infix operator \`${token}\``);
  }

  getPostfixOperator(token: string): FilterPostfixOperator {
    const lower = token.toLowerCase();
    for (const op of this.postfixOperators) {
      for (const t of op.getTokens()) {
        if (t.toLowerCase() === lower) return op;
      }
    }
    throw new Error(`Unrecognized postfix operator \`${token}\``);
  }

  getPrefixOperatorByType<T extends FilterPrefixOperator>(type: new (...args: any[]) => T): T {
    for (const op of this.prefixOperators) {
      if (op instanceof type) return op as T;
    }
    throw new Error(`Prefix operator of type \`${type.name}\` not found`);
  }

  getInfixOperatorByType<T extends FilterInfixOperator>(type: new (...args: any[]) => T): T {
    for (const op of this.infixOperators) {
      if (op instanceof type) return op as T;
    }
    throw new Error(`Infix operator of type \`${type.name}\` not found`);
  }

  getPostfixOperatorByType<T extends FilterPostfixOperator>(type: new (...args: any[]) => T): T {
    for (const op of this.postfixOperators) {
      if (op instanceof type) return op as T;
    }
    throw new Error(`Postfix operator of type \`${type.name}\` not found`);
  }

  getSortedOperators(): OperatorToken[] {
    return this.sortedOperators;
  }
}

let _defaultOperators: FilterOperatorsImpl | null = null;

export function getDefaultOperators(): FilterOperatorsImpl {
  if (!_defaultOperators) {
    _defaultOperators = new FilterOperatorsImpl(
      [new NotOperator()],
      [
        new EqualOperator(),
        new NotEqualOperator(),
        new GreaterThanOperator(),
        new GreaterThanOrEqualOperator(),
        new LessThanOperator(),
        new LessThanOrEqualOperator(),
        new LikeOperator(),
        new InsensitiveLikeOperator(),
        new InOperator(),
        new NotInOperator(),
        new AndOperator(),
        new OrOperator(),
        new XorOperator(),
      ],
      [
        new IsNullOperator(),
        new IsNotNullOperator(),
        new IsEmptyOperator(),
        new IsNotEmptyOperator(),
      ]
    );
  }
  return _defaultOperators;
}
