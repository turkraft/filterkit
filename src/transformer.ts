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

export class FilterStringTransformer extends BaseFilterNodeTransformer<string> {
  transformField(node: FieldNode): string {
    return node.getName();
  }

  transformInput(node: InputNode): string {
    const value = node.getValue();
    const str = value == null ? 'null' : String(value);
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
      this.transform(node.getLeft()) +
      ' ' +
      node.getOperator().getToken() +
      ' [' +
      node.getPatterns().map(p => this.transform(p)).join(', ') +
      ']'
    );
  }

  transformPrefixOperation(node: PrefixOperationNode): string {
    return node.getOperator().getToken() + ' ' + this.transform(node.getRight());
  }

  transformInfixOperation(node: InfixOperationNode): string {
    if (this.isBetweenPattern(node)) {
      const gteNode = node.getLeft() as InfixOperationNode;
      const lteNode = node.getRight() as InfixOperationNode;
      return (
        this.transform(gteNode.getLeft()) +
        ' between ' +
        this.transform(gteNode.getRight()) +
        ' and ' +
        this.transform(lteNode.getRight())
      );
    }
    return (
      this.transform(node.getLeft()) +
      ' ' +
      node.getOperator().getToken() +
      ' ' +
      this.transform(node.getRight())
    );
  }

  transformPostfixOperation(node: PostfixOperationNode): string {
    return this.transform(node.getLeft()) + ' ' + node.getOperator().getToken();
  }

  private isBetweenPattern(node: InfixOperationNode): boolean {
    if (!(node.getOperator() instanceof AndOperator)) return false;
    const leftOp = node.getLeft();
    const rightOp = node.getRight();
    if (!(leftOp instanceof InfixOperationNode)) return false;
    if (!(rightOp instanceof InfixOperationNode)) return false;
    if (!(leftOp.getOperator() instanceof GreaterThanOrEqualOperator)) return false;
    if (!(rightOp.getOperator() instanceof LessThanOrEqualOperator)) return false;
    const leftField = this.transform(leftOp.getLeft());
    const rightField = this.transform(rightOp.getLeft());
    return leftField === rightField;
  }
}
