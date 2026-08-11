export interface FilterDefinition {
  getDescription(): string | null;
  getExample(): string | null;
}

export abstract class FilterOperator implements FilterDefinition {
  private readonly tokens: string[];
  private readonly priority: number;

  constructor(tokens: string | string[], priority: number) {
    if (typeof tokens === 'string') {
      this.tokens = [tokens];
    } else {
      this.tokens = tokens;
    }
    this.priority = priority;
  }

  getTokens(): string[] {
    return this.tokens;
  }

  getToken(): string {
    return this.tokens[0];
  }

  getPriority(): number {
    return this.priority;
  }

  getDescription(): string | null {
    return null;
  }

  getExample(): string | null {
    return null;
  }
}

export abstract class FilterPrefixOperator extends FilterOperator {
  constructor(tokens: string | string[], priority: number) {
    super(tokens, priority);
  }

  toNode(right: FilterNode): PrefixOperationNode {
    return new PrefixOperationNode(this, right);
  }
}

export abstract class FilterInfixOperator extends FilterOperator {
  constructor(tokens: string | string[], priority: number) {
    super(tokens, priority);
  }

  toNode(left: FilterNode, right: FilterNode): InfixOperationNode {
    return new InfixOperationNode(left, this, right);
  }
}

export abstract class FilterPostfixOperator extends FilterOperator {
  constructor(tokens: string | string[], priority: number) {
    super(tokens, priority);
  }

  toNode(left: FilterNode): PostfixOperationNode {
    return new PostfixOperationNode(left, this);
  }
}

export abstract class FilterFunction implements FilterDefinition {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | null {
    return null;
  }

  getExample(): string | null {
    return null;
  }
}

export abstract class FilterPlaceholder implements FilterDefinition {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | null {
    return null;
  }

  getExample(): string | null {
    return null;
  }
}

export abstract class FilterNode {
  private _payload: unknown = undefined;

  get payload(): unknown {
    return this._payload;
  }

  set payload(value: unknown) {
    this._payload = value;
  }

  prefix(operator: FilterPrefixOperator): PrefixOperationNode {
    return new PrefixOperationNode(operator, this);
  }

  infix(operator: FilterInfixOperator, right: FilterNode): InfixOperationNode {
    return new InfixOperationNode(this, operator, right);
  }

  postfix(operator: FilterPostfixOperator): PostfixOperationNode {
    return new PostfixOperationNode(this, operator);
  }

  abstract getChildren(): FilterNode[];
}

export class FieldNode extends FilterNode {
  private readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  getName(): string {
    return this.name;
  }

  getChildren(): FilterNode[] {
    return [];
  }
}

export class InputNode extends FilterNode {
  private readonly value: unknown;

  constructor(value: unknown) {
    super();
    this.value = value;
  }

  getValue(): unknown {
    return this.value;
  }

  getChildren(): FilterNode[] {
    return [];
  }
}

export class PlaceholderNode extends FilterNode {
  private readonly placeholder: FilterPlaceholder;

  constructor(placeholder: FilterPlaceholder) {
    super();
    this.placeholder = placeholder;
  }

  getPlaceholder(): FilterPlaceholder {
    return this.placeholder;
  }

  getChildren(): FilterNode[] {
    return [];
  }
}

export class CollectionNode extends FilterNode {
  private readonly items: FilterNode[];

  constructor(items: FilterNode[]) {
    super();
    this.items = items;
  }

  getItems(): FilterNode[] {
    return this.items;
  }

  getChildren(): FilterNode[] {
    return this.getItems();
  }
}

export class CollectionLikeNode extends FilterNode {
  private readonly left: FilterNode;
  private readonly operator: FilterInfixOperator;
  private readonly patterns: FilterNode[];

  constructor(left: FilterNode, operator: FilterInfixOperator, patterns: FilterNode[]) {
    super();
    this.left = left;
    this.operator = operator;
    this.patterns = patterns;
  }

  getLeft(): FilterNode {
    return this.left;
  }

  getOperator(): FilterInfixOperator {
    return this.operator;
  }

  getPatterns(): FilterNode[] {
    return this.patterns;
  }

  getChildren(): FilterNode[] {
    return [this.left];
  }
}

export class PriorityNode extends FilterNode {
  private readonly node: FilterNode;

  constructor(node: FilterNode) {
    super();
    this.node = node;
  }

  getNode(): FilterNode {
    return this.node;
  }

  getChildren(): FilterNode[] {
    return [this.node];
  }
}

export class FunctionNode extends FilterNode {
  private readonly filterFunction: FilterFunction;
  private readonly args: FilterNode[];

  constructor(filterFunction: FilterFunction, args: FilterNode[]) {
    super();
    this.filterFunction = filterFunction;
    this.args = args;
  }

  getFunction(): FilterFunction {
    return this.filterFunction;
  }

  getArguments(): FilterNode[] {
    return this.args;
  }

  getArgument(index: number): FilterNode {
    if (this.args.length <= index) {
      throw new Error(
        `The function \`${this.filterFunction.getName()}\` expects at least ${index + 1} argument(s)`
      );
    }
    return this.args[index];
  }

  getChildren(): FilterNode[] {
    return this.getArguments();
  }
}

export abstract class OperationNode extends FilterNode {
  private readonly operator: FilterOperator;

  constructor(operator: FilterOperator) {
    super();
    this.operator = operator;
  }

  getOperator(): FilterOperator {
    return this.operator;
  }
}

export class InfixOperationNode extends OperationNode {
  private readonly left: FilterNode;
  private readonly right: FilterNode;

  constructor(left: FilterNode, operator: FilterInfixOperator, right: FilterNode) {
    super(operator);
    this.left = left;
    this.right = right;
  }

  getLeft(): FilterNode {
    return this.left;
  }

  getRight(): FilterNode {
    return this.right;
  }

  getOperator(): FilterInfixOperator {
    return super.getOperator() as FilterInfixOperator;
  }

  getChildren(): FilterNode[] {
    return [this.left, this.right];
  }
}

export class PrefixOperationNode extends OperationNode {
  private readonly right: FilterNode;

  constructor(operator: FilterPrefixOperator, right: FilterNode) {
    super(operator);
    this.right = right;
  }

  getRight(): FilterNode {
    return this.right;
  }

  getOperator(): FilterPrefixOperator {
    return super.getOperator() as FilterPrefixOperator;
  }

  getChildren(): FilterNode[] {
    return [this.right];
  }
}

export class PostfixOperationNode extends OperationNode {
  private readonly left: FilterNode;

  constructor(left: FilterNode, operator: FilterPostfixOperator) {
    super(operator);
    this.left = left;
  }

  getLeft(): FilterNode {
    return this.left;
  }

  getOperator(): FilterPostfixOperator {
    return super.getOperator() as FilterPostfixOperator;
  }

  getChildren(): FilterNode[] {
    return [this.left];
  }
}
