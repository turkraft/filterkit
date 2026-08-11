import {
  FilterNode,
  FieldNode,
  InputNode,
  PlaceholderNode,
  PriorityNode,
  FunctionNode,
  CollectionNode,
  InfixOperationNode,
  PrefixOperationNode,
  PostfixOperationNode,
  CollectionLikeNode,
} from './nodes.js';
import type {
  FilterPrefixOperator,
  FilterInfixOperator,
  FilterPostfixOperator,
  FilterFunction,
  FilterPlaceholder,
} from './nodes.js';
import {
  type FilterOperators,
  type FilterOperatorsImpl,
  getDefaultOperators,
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

export interface Step {
  getOperators(): FilterOperators;
}

export interface StepWithResult extends Step {
  get(): FilterNode;
}

type RawValue = string | number | boolean | null | undefined;

function toStep(operators: FilterOperators, value: RawValue | StepWithResult): StepWithResult {
  if (value != null && typeof value === 'object' && 'get' in value && 'getOperators' in value) {
    return value as StepWithResult;
  }
  return new StepWithResultImpl(operators, new InputNode(value));
}

function toCollection(operators: FilterOperators, items: (RawValue | StepWithResult)[]): StepWithResult {
  return new StepWithResultImpl(operators, new CollectionNode(items.map(i => toStep(operators, i).get())));
}

class StepWithResultImpl implements StepWithResult {
  constructor(
    private operators: FilterOperators,
    private result: FilterNode
  ) {}

  getOperators(): FilterOperators {
    return this.operators;
  }

  get(): FilterNode {
    return this.result;
  }
}

export class ComparisonResult extends StepWithResultImpl {
  equal(to: RawValue | StepWithResult): LogicResult {
    const s = toStep(this.getOperators(), to);
    return new LogicResult(this.getOperators(), this.get().infix(this.getOperators().getInfixOperatorByType(EqualOperator), s.get()));
  }

  notEqual(to: RawValue | StepWithResult): LogicResult {
    const s = toStep(this.getOperators(), to);
    return new LogicResult(this.getOperators(), this.get().infix(this.getOperators().getInfixOperatorByType(NotEqualOperator), s.get()));
  }

  greaterThan(to: RawValue | StepWithResult): LogicResult {
    const s = toStep(this.getOperators(), to);
    return new LogicResult(this.getOperators(), this.get().infix(this.getOperators().getInfixOperatorByType(GreaterThanOperator), s.get()));
  }

  greaterThanOrEqual(to: RawValue | StepWithResult): LogicResult {
    const s = toStep(this.getOperators(), to);
    return new LogicResult(this.getOperators(), this.get().infix(this.getOperators().getInfixOperatorByType(GreaterThanOrEqualOperator), s.get()));
  }

  lessThan(to: RawValue | StepWithResult): LogicResult {
    const s = toStep(this.getOperators(), to);
    return new LogicResult(this.getOperators(), this.get().infix(this.getOperators().getInfixOperatorByType(LessThanOperator), s.get()));
  }

  lessThanOrEqual(to: RawValue | StepWithResult): LogicResult {
    const s = toStep(this.getOperators(), to);
    return new LogicResult(this.getOperators(), this.get().infix(this.getOperators().getInfixOperatorByType(LessThanOrEqualOperator), s.get()));
  }

  like(to: RawValue | StepWithResult): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().infix(this.getOperators().getInfixOperatorByType(LikeOperator), toStep(this.getOperators(), to).get())
    );
  }

  startsWith(value: string): LogicResult {
    return this.like(toStep(this.getOperators(), value + '%'));
  }

  endsWith(value: string): LogicResult {
    return this.like(toStep(this.getOperators(), '%' + value));
  }

  contains(value: string): LogicResult {
    return this.like(toStep(this.getOperators(), '%' + value + '%'));
  }

  insensitiveLike(to: RawValue | StepWithResult): LogicResult {
    const s = toStep(this.getOperators(), to);
    return new LogicResult(this.getOperators(), this.get().infix(this.getOperators().getInfixOperatorByType(InsensitiveLikeOperator), s.get()));
  }

  insensitiveStartsWith(value: string): LogicResult {
    return this.insensitiveLike(toStep(this.getOperators(), value + '%'));
  }

  insensitiveEndsWith(value: string): LogicResult {
    return this.insensitiveLike(toStep(this.getOperators(), '%' + value));
  }

  insensitiveContains(value: string): LogicResult {
    return this.insensitiveLike(toStep(this.getOperators(), '%' + value + '%'));
  }

  insensitiveLikeCollection(...patterns: (RawValue | StepWithResult)[]): LogicResult {
    return new LogicResult(this.getOperators(), new CollectionLikeNode(this.get(), new InsensitiveLikeOperator(), patterns.map(p => toStep(this.getOperators(), p).get())));
  }

  in(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().infix(this.getOperators().getInfixOperatorByType(InOperator), (Array.isArray(to) ? toCollection(this.getOperators(), to) : toStep(this.getOperators(), to)).get())
    );
  }

  notIn(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().infix(this.getOperators().getInfixOperatorByType(NotInOperator), (Array.isArray(to) ? toCollection(this.getOperators(), to) : toStep(this.getOperators(), to)).get())
    );
  }

  isNull(): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().postfix(this.getOperators().getPostfixOperatorByType(IsNullOperator))
    );
  }

  isNotNull(): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().postfix(this.getOperators().getPostfixOperatorByType(IsNotNullOperator))
    );
  }

  isEmpty(): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().postfix(this.getOperators().getPostfixOperatorByType(IsEmptyOperator))
    );
  }

  isNotEmpty(): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().postfix(this.getOperators().getPostfixOperatorByType(IsNotEmptyOperator))
    );
  }

  between(lower: RawValue | StepWithResult, upper: RawValue | StepWithResult): LogicResult {
    const ops = this.getOperators();
    const gte = this.get().infix(ops.getInfixOperatorByType(GreaterThanOrEqualOperator), toStep(ops, lower).get());
    const lte = this.get().infix(ops.getInfixOperatorByType(LessThanOrEqualOperator), toStep(ops, upper).get());
    return new LogicResult(ops, gte.infix(ops.getInfixOperatorByType(AndOperator), lte));
  }

  likeCollection(...patterns: (RawValue | StepWithResult)[]): LogicResult {
    return new LogicResult(this.getOperators(), new CollectionLikeNode(this.get(), new LikeOperator(), patterns.map(p => toStep(this.getOperators(), p).get())));
  }
}

export class LogicResult extends StepWithResultImpl {
  and(other: StepWithResult): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().infix(this.getOperators().getInfixOperatorByType(AndOperator), other.get())
    );
  }

  or(other: StepWithResult): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().infix(this.getOperators().getInfixOperatorByType(OrOperator), other.get())
    );
  }

  xor(other: StepWithResult): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().infix(this.getOperators().getInfixOperatorByType(XorOperator), other.get())
    );
  }

  not(): LogicResult {
    return new LogicResult(
      this.getOperators(),
      this.get().prefix(this.getOperators().getPrefixOperatorByType(NotOperator))
    );
  }
}

export class FieldResult extends StepWithResultImpl {
  equal(to: RawValue | StepWithResult): LogicResult {
    return new ComparisonResult(this.getOperators(), this.get()).equal(to);
  }
  notEqual(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).notEqual(to); }
  greaterThan(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).greaterThan(to); }
  greaterThanOrEqual(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).greaterThanOrEqual(to); }
  lessThan(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).lessThan(to); }
  lessThanOrEqual(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).lessThanOrEqual(to); }
  like(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).like(to); }
  startsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).startsWith(value); }
  endsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).endsWith(value); }
  contains(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).contains(value); }
  insensitiveLike(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveLike(to); }
  in(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).in(to); }
  notIn(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).notIn(to); }
  isNull(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNull(); }
  isNotNull(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNotNull(); }
  isEmpty(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isEmpty(); }
  isNotEmpty(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNotEmpty(); }
  between(lower: RawValue | StepWithResult, upper: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).between(lower, upper); }
  likeCollection(...patterns: (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).likeCollection(...patterns); }
  insensitiveStartsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveStartsWith(value); }
  insensitiveEndsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveEndsWith(value); }
  insensitiveContains(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveContains(value); }
  insensitiveLikeCollection(...patterns: (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveLikeCollection(...patterns); }

  and(other: StepWithResult): LogicResult { return new LogicResult(this.getOperators(), this.get()).and(other); }
  or(other: StepWithResult): LogicResult { return new LogicResult(this.getOperators(), this.get()).or(other); }
  xor(other: StepWithResult): LogicResult { return new LogicResult(this.getOperators(), this.get()).xor(other); }
  not(): LogicResult { return new LogicResult(this.getOperators(), this.get()).not(); }
}

export class InputResult extends StepWithResultImpl {
  equal(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).equal(to); }
  notEqual(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).notEqual(to); }
  greaterThan(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).greaterThan(to); }
  greaterThanOrEqual(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).greaterThanOrEqual(to); }
  lessThan(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).lessThan(to); }
  lessThanOrEqual(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).lessThanOrEqual(to); }
  like(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).like(to); }
  startsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).startsWith(value); }
  endsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).endsWith(value); }
  contains(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).contains(value); }
  insensitiveLike(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveLike(to); }
  in(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).in(to); }
  notIn(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).notIn(to); }
  isNull(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNull(); }
  isNotNull(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNotNull(); }
  isEmpty(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isEmpty(); }
  isNotEmpty(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNotEmpty(); }
  between(lower: RawValue | StepWithResult, upper: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).between(lower, upper); }
  insensitiveStartsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveStartsWith(value); }
  insensitiveEndsWith(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveEndsWith(value); }
  insensitiveContains(value: string): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveContains(value); }
  insensitiveLikeCollection(...patterns: (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).insensitiveLikeCollection(...patterns); }
}

export class CollectionResult extends StepWithResultImpl {
  equal(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).equal(to); }
  notEqual(to: RawValue | StepWithResult): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).notEqual(to); }
  in(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).in(to); }
  notIn(to: RawValue | StepWithResult | (RawValue | StepWithResult)[]): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).notIn(to); }
  isNull(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNull(); }
  isNotNull(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNotNull(); }
  isEmpty(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isEmpty(); }
  isNotEmpty(): LogicResult { return new ComparisonResult(this.getOperators(), this.get()).isNotEmpty(); }
}

export class FunctionResult extends FieldResult {}
export class PlaceholderResult extends FieldResult {}
export class PriorityResult extends LogicResult {}

export class FilterBuilder {
  private operators: FilterOperators;

  constructor(operators?: FilterOperators) {
    this.operators = operators ?? getDefaultOperators();
  }

  getOperators(): FilterOperators {
    return this.operators;
  }

  from(node: FilterNode): StepWithResult {
    return new StepWithResultImpl(this.operators, node);
  }

  field(name: string): FieldResult {
    return new FieldResult(this.operators, new FieldNode(name));
  }

  input(value: unknown): InputResult {
    return new InputResult(this.operators, new InputNode(value));
  }

  collection(...items: StepWithResult[]): CollectionResult {
    return new CollectionResult(
      this.operators,
      new CollectionNode(items.map(i => i.get()))
    );
  }

  function(func: FilterFunction, ...args: StepWithResult[]): FunctionResult {
    return new FunctionResult(
      this.operators,
      new FunctionNode(func, args.map(a => a.get()))
    );
  }

  priority(value: StepWithResult): PriorityResult {
    return new PriorityResult(
      this.operators,
      new PriorityNode(value.get())
    );
  }

  placeholder(ph: FilterPlaceholder): PlaceholderResult {
    return new PlaceholderResult(
      this.operators,
      new PlaceholderNode(ph)
    );
  }

  and(...args: (StepWithResult | null | undefined)[]): LogicResult {
    const filtered = args.filter(a => a != null) as StepWithResult[];
    if (filtered.length === 0) {
      throw new Error('At least one not null argument should be present');
    }
    let result: FilterNode = filtered[0].get();
    for (let i = 1; i < filtered.length; i++) {
      result = result.infix(this.operators.getInfixOperatorByType(AndOperator), filtered[i].get());
    }
    return new LogicResult(this.operators, result);
  }

  or(...args: (StepWithResult | null | undefined)[]): LogicResult {
    const filtered = args.filter(a => a != null) as StepWithResult[];
    if (filtered.length === 0) {
      throw new Error('At least one not null argument should be present');
    }
    let result: FilterNode = filtered[0].get();
    for (let i = 1; i < filtered.length; i++) {
      result = result.infix(this.operators.getInfixOperatorByType(OrOperator), filtered[i].get());
    }
    return new LogicResult(this.operators, result);
  }
}
