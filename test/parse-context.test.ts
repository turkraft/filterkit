import { describe, it, expect } from 'vitest';
import { FilterParserImpl, ParseContextImpl, type ParseContext } from '../src/parser.js';
import { FilterNode, FieldNode, InputNode, InfixOperationNode } from '../src/nodes.js';

describe('ParseContext', () => {
  it('field mapper renames fields', () => {
    const ctx = new ParseContextImpl((name) => name === 'name' ? 'fullName' : name);
    const parser = new FilterParserImpl();
    const node = parser.parse("name : 'john'", ctx);
    const infix = node as InfixOperationNode;
    expect((infix.getLeft() as FieldNode).getName()).toBe('fullName');
  });

  it('field mapper renames each segment of dotted field', () => {
    const ctx = new ParseContextImpl((name) => 'mapped_' + name);
    const parser = new FilterParserImpl();
    const node = parser.parse("user.name : 'john'", ctx);
    const infix = node as InfixOperationNode;
    expect((infix.getLeft() as FieldNode).getName()).toBe('mapped_user.mapped_name');
  });

  it('node mapper is called for every sub-node', () => {
    const calls: string[] = [];
    const ctx = new ParseContextImpl(
      undefined,
      (node) => {
        if (node instanceof FieldNode) calls.push('field:' + node.getName());
        if (node instanceof InputNode) calls.push('input:' + node.getValue());
        if (node instanceof InfixOperationNode) calls.push('infix');
        return node;
      }
    );
    const parser = new FilterParserImpl();
    parser.parse("a : '1' and b : '2'", ctx);
    expect(calls).toContain('field:a');
    expect(calls).toContain("input:1");
    expect(calls).toContain('field:b');
    expect(calls).toContain("input:2");
    expect(calls.filter(c => c === 'infix').length).toBeGreaterThanOrEqual(2);
  });

  it('node mapper wrapping returns modified node', () => {
    const ctx = new ParseContextImpl(undefined, (node) => {
      const n = node;
      n.payload = 'tagged';
      return n;
    });
    const parser = new FilterParserImpl();
    const node = parser.parse("name : 'john'", ctx);

    function checkPayload(n: FilterNode): boolean {
      if (n.payload !== 'tagged') return false;
      for (const child of n.getChildren()) {
        if (!checkPayload(child)) return false;
      }
      return true;
    }

    expect(checkPayload(node)).toBe(true);
  });

  it('null from node mapper keeps original node', () => {
    const ctx = new ParseContextImpl(undefined, () => null as any);
    const parser = new FilterParserImpl();
    const node = parser.parse("name : 'john'", ctx);
    expect(node).toBeInstanceOf(InfixOperationNode);
    expect((node as InfixOperationNode).getLeft()).toBeInstanceOf(FieldNode);
  });
});
