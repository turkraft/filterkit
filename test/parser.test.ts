import { describe, it, expect } from 'vitest';
import { FilterParserImpl, type FilterParser } from '../src/parser.js';
import {
  FieldNode,
  InputNode,
  InfixOperationNode,
  PrefixOperationNode,
  PostfixOperationNode,
  PriorityNode,
  CollectionNode,
  FunctionNode,
  PlaceholderNode,
} from '../src/nodes.js';
import { EqualOperator, AndOperator, OrOperator, NotOperator, GreaterThanOperator } from '../src/operators.js';

const parser: FilterParser = new FilterParserImpl();

function parse(input: string) {
  return parser.parse(input);
}

describe('Parser', () => {
  describe('basic expressions', () => {
    it('field equals string', () => {
      const node = parse("name : 'john'");
      expect(node).toBeInstanceOf(InfixOperationNode);
      const infix = node as InfixOperationNode;
      expect(infix.getOperator()).toBeInstanceOf(EqualOperator);
      expect((infix.getLeft() as FieldNode).getName()).toBe('name');
      expect((infix.getRight() as InputNode).getValue()).toBe('john');
    });

    it('field equals number', () => {
      const node = parse('age > 18');
      expect(node).toBeInstanceOf(InfixOperationNode);
      const infix = node as InfixOperationNode;
      expect(infix.getOperator()).toBeInstanceOf(GreaterThanOperator);
      expect((infix.getLeft() as FieldNode).getName()).toBe('age');
      expect((infix.getRight() as InputNode).getValue()).toBe(18);
    });

    it('field equals boolean true', () => {
      const node = parse('active : true');
      const infix = node as InfixOperationNode;
      expect((infix.getRight() as InputNode).getValue()).toBe(true);
    });

    it('field equals boolean false', () => {
      const node = parse('deleted : false');
      const infix = node as InfixOperationNode;
      expect((infix.getRight() as InputNode).getValue()).toBe(false);
    });

    it('field equals negative number', () => {
      const node = parse('balance : -50');
      const infix = node as InfixOperationNode;
      expect((infix.getRight() as InputNode).getValue()).toBe(-50);
    });

    it('field equals decimal', () => {
      const node = parse('price : 19.99');
      const infix = node as InfixOperationNode;
      expect((infix.getRight() as InputNode).getValue()).toBe(19.99);
    });
  });

  describe('logical operators', () => {
    it('and', () => {
      const node = parse("a : '1' and b : '2'");
      const infix = node as InfixOperationNode;
      expect(infix.getOperator()).toBeInstanceOf(AndOperator);
    });

    it('or', () => {
      const node = parse("a : '1' or b : '2'");
      const infix = node as InfixOperationNode;
      expect(infix.getOperator()).toBeInstanceOf(OrOperator);
    });

    it('not', () => {
      const node = parse("not active : true");
      const prefix = node as PrefixOperationNode;
      expect(prefix.getOperator()).toBeInstanceOf(NotOperator);
    });

    it('and/or precedence', () => {
      const node = parse("a : '1' or b : '2' and c : '3'");
      const infix = node as InfixOperationNode;
      expect(infix.getOperator()).toBeInstanceOf(OrOperator);
      const right = infix.getRight() as InfixOperationNode;
      expect(right.getOperator()).toBeInstanceOf(AndOperator);
    });

    it('parentheses', () => {
      const node = parse("(a : '1' or b : '2') and c : '3'");
      const infix = node as InfixOperationNode;
      expect(infix.getOperator()).toBeInstanceOf(AndOperator);
      expect(infix.getLeft()).toBeInstanceOf(PriorityNode);
    });
  });

  describe('collection', () => {
    it('in collection', () => {
      const node = parse("status in ['active', 'pending']");
      const infix = node as InfixOperationNode;
      expect((infix.getLeft() as FieldNode).getName()).toBe('status');
      const coll = infix.getRight() as CollectionNode;
      expect(coll.getItems()).toHaveLength(2);
      expect((coll.getItems()[0] as InputNode).getValue()).toBe('active');
    });

    it('empty collection', () => {
      const node = parse('x in []');
      const infix = node as InfixOperationNode;
      const coll = infix.getRight() as CollectionNode;
      expect(coll.getItems()).toHaveLength(0);
    });
  });

  describe('nested fields', () => {
    it('single dot', () => {
      const node = parse("user.name : 'john'");
      const infix = node as InfixOperationNode;
      expect((infix.getLeft() as FieldNode).getName()).toBe('user.name');
    });

    it('multiple dots', () => {
      const node = parse("a.b.c : 'deep'");
      const infix = node as InfixOperationNode;
      expect((infix.getLeft() as FieldNode).getName()).toBe('a.b.c');
    });
  });

  describe('postfix operators', () => {
    it('is null', () => {
      const node = parse('name is null');
      const postfix = node as PostfixOperationNode;
      expect((postfix.getLeft() as FieldNode).getName()).toBe('name');
    });

    it('is not null', () => {
      const node = parse('name is not null');
      const postfix = node as PostfixOperationNode;
      expect((postfix.getLeft() as FieldNode).getName()).toBe('name');
    });

    it('is empty', () => {
      const node = parse('items is empty');
      expect(node).toBeInstanceOf(PostfixOperationNode);
    });

    it('is not empty', () => {
      const node = parse('items is not empty');
      expect(node).toBeInstanceOf(PostfixOperationNode);
    });
  });

  describe('between', () => {
    it('between numbers', () => {
      const node = parse('age between 18 and 65');
      const infix = node as InfixOperationNode;
      expect(infix.getOperator()).toBeInstanceOf(AndOperator);
      const left = infix.getLeft() as InfixOperationNode;
      const right = infix.getRight() as InfixOperationNode;
      expect((left.getLeft() as FieldNode).getName()).toBe('age');
      expect((right.getLeft() as FieldNode).getName()).toBe('age');
      expect((left.getRight() as InputNode).getValue()).toBe(18);
      expect((right.getRight() as InputNode).getValue()).toBe(65);
    });
  });
});
