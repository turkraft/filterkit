import {
  FilterNode,
  FieldNode,
  InputNode,
  PlaceholderNode,
  PriorityNode,
  FunctionNode,
  CollectionNode,
  CollectionLikeNode,
  InfixOperationNode,
  PrefixOperationNode,
  PostfixOperationNode,
  OperationNode,
} from './nodes.js';
import { AndOperator, GreaterThanOrEqualOperator, LessThanOrEqualOperator } from './operators.js';

export interface FilterNodeTransformer<Target> {

  transform(node: FilterNode): Target;

  transformField(node: FieldNode): Target;
  transformInput(node: InputNode): Target;
  transformPriority(node: PriorityNode): Target;
  transformPlaceholder(node: PlaceholderNode): Target;
  transformFunction(node: FunctionNode): Target;
  transformCollection(node: CollectionNode): Target;
  transformCollectionLike(node: CollectionLikeNode): Target;
  transformPrefixOperation(node: PrefixOperationNode): Target;
  transformInfixOperation(node: InfixOperationNode): Target;
  transformPostfixOperation(node: PostfixOperationNode): Target;
}

export abstract class BaseFilterNodeTransformer<Target> implements FilterNodeTransformer<Target> {

  transform(node: FilterNode): Target {
    if (node instanceof FieldNode) return this.transformField(node);
    if (node instanceof InputNode) return this.transformInput(node);
    if (node instanceof PriorityNode) return this.transformPriority(node);
    if (node instanceof PlaceholderNode) return this.transformPlaceholder(node);
    if (node instanceof FunctionNode) return this.transformFunction(node);
    if (node instanceof CollectionNode) return this.transformCollection(node);
    if (node instanceof CollectionLikeNode) return this.transformCollectionLike(node);
    if (node instanceof OperationNode) return this.transformOperation(node);
    throw new Error(`Unsupported node: ${node.constructor.name}`);
  }

  protected transformOperation(node: OperationNode): Target {
    if (node instanceof PrefixOperationNode) return this.transformPrefixOperation(node);
    if (node instanceof InfixOperationNode) return this.transformInfixOperation(node);
    if (node instanceof PostfixOperationNode) return this.transformPostfixOperation(node);
    throw new Error(`Unsupported operation node: ${node.constructor.name}`);
  }

  abstract transformField(node: FieldNode): Target;
  abstract transformInput(node: InputNode): Target;
  abstract transformPriority(node: PriorityNode): Target;
  abstract transformPlaceholder(node: PlaceholderNode): Target;
  abstract transformFunction(node: FunctionNode): Target;
  abstract transformCollection(node: CollectionNode): Target;
  transformCollectionLike(node: CollectionLikeNode): Target {
    throw new Error('CollectionLikeNode not supported');
  }
  abstract transformPrefixOperation(node: PrefixOperationNode): Target;
  abstract transformInfixOperation(node: InfixOperationNode): Target;
  abstract transformPostfixOperation(node: PostfixOperationNode): Target;
}

export function stringifyValue(value: unknown): string {
  if (value == null) return 'null';
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? String(value) : value.toISOString();
  }
  return String(value);
}

const ATOMIC = Number.POSITIVE_INFINITY;

const BETWEEN_OPERAND_PRECEDENCE = 101;

export class FilterStringTransformer extends BaseFilterNodeTransformer<string> {
  transformField(node: FieldNode): string {
    return node.getName();
  }

  transformInput(node: InputNode): string {
    const str = stringifyValue(node.getValue());
    return "'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  transformPriority(node: PriorityNode): string {
    return '(' + this.transform(node.getNode()) + ')';
  }

  transformPlaceholder(node: PlaceholderNode): string {
    return '`' + node.getPlaceholder().getName() + '`';
  }

  transformFunction(node: FunctionNode): string {
    return (
      node.getFunction().getName() +
      '(' +
      node.getArguments().map(a => this.transform(a)).join(', ') +
      ')'
    );
  }

  transformCollection(node: CollectionNode): string {
    return '[' + node.getItems().map(i => this.transform(i)).join(', ') + ']';
  }

  transformCollectionLike(node: CollectionLikeNode): string {
    return (
      this.operand(node.getLeft(), node.getOperator().getPriority()) +
      ' ' +
      node.getOperator().getToken() +
      ' [' +
      node.getPatterns().map(p => this.transform(p)).join(', ') +
      ']'
    );
  }

  transformPrefixOperation(node: PrefixOperationNode): string {
    return (
      node.getOperator().getToken() +
      ' ' +
      this.operand(node.getRight(), node.getOperator().getPriority())
    );
  }

  transformInfixOperation(node: InfixOperationNode): string {
    if (this.isBetweenPattern(node)) {
      const gteNode = node.getLeft() as InfixOperationNode;
      const lteNode = node.getRight() as InfixOperationNode;
      return (
        this.operand(gteNode.getLeft(), BETWEEN_OPERAND_PRECEDENCE) +
        ' between ' +
        this.operand(gteNode.getRight(), BETWEEN_OPERAND_PRECEDENCE) +
        ' and ' +
        this.operand(lteNode.getRight(), BETWEEN_OPERAND_PRECEDENCE)
      );
    }
    const priority = node.getOperator().getPriority();
    return (
      this.operand(node.getLeft(), priority) +
      ' ' +
      node.getOperator().getToken() +
      ' ' +
      this.operand(node.getRight(), priority, true)
    );
  }

  transformPostfixOperation(node: PostfixOperationNode): string {
    return (
      this.operand(node.getLeft(), node.getOperator().getPriority()) +
      ' ' +
      node.getOperator().getToken()
    );
  }

  protected operand(node: FilterNode, parentPriority: number, rightHandSide = false): string {
    const rendered = this.transform(node);
    const priority = FilterStringTransformer.precedenceOf(node);
    const needsParentheses = rightHandSide
      ? priority <= parentPriority
      : priority < parentPriority;
    return needsParentheses ? '(' + rendered + ')' : rendered;
  }

  static precedenceOf(node: FilterNode): number {
    if (node instanceof InfixOperationNode) {
      return FilterStringTransformer.isBetweenShape(node) ? 100 : node.getOperator().getPriority();
    }
    if (node instanceof PrefixOperationNode || node instanceof PostfixOperationNode) {
      return node.getOperator().getPriority();
    }
    if (node instanceof CollectionLikeNode) {
      return node.getOperator().getPriority();
    }
    return ATOMIC;
  }

  private isBetweenPattern(node: InfixOperationNode): boolean {
    return FilterStringTransformer.isBetweenShape(node);
  }

  private static isBetweenShape(node: InfixOperationNode): boolean {
    if (!(node.getOperator() instanceof AndOperator)) return false;
    const leftOp = node.getLeft();
    const rightOp = node.getRight();
    if (!(leftOp instanceof InfixOperationNode)) return false;
    if (!(rightOp instanceof InfixOperationNode)) return false;
    if (!(leftOp.getOperator() instanceof GreaterThanOrEqualOperator)) return false;
    if (!(rightOp.getOperator() instanceof LessThanOrEqualOperator)) return false;
    return nodeKey(leftOp.getLeft()) === nodeKey(rightOp.getLeft());
  }
}

function nodeKey(node: FilterNode): string {
  if (node instanceof FieldNode) return 'field:' + node.getName();
  if (node instanceof InputNode) return 'input:' + stringifyValue(node.getValue());
  if (node instanceof FunctionNode) {
    return 'fn:' + node.getFunction().getName() + '(' +
      node.getArguments().map(nodeKey).join(',') + ')';
  }
  if (node instanceof PlaceholderNode) return 'ph:' + node.getPlaceholder().getName();
  return 'other:' + node.constructor.name + ':' + node.getChildren().map(nodeKey).join(',');
}
