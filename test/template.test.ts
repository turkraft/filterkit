import { describe, it, expect } from 'vitest';
import { f } from '../src/template.js';
import { stringify, parse } from '../src/filterkit.js';
import { filter } from '../src/predicate.js';
import { FilterNode, FieldNode, InputNode, InfixOperationNode } from '../src/nodes.js';

describe('template literal', () => {
  const users = [
    { name: 'John', age: 30, active: true },
    { name: 'Jane', age: 25, active: false },
    { name: 'Bob', age: 40, active: true },
  ];

  it('parses simple string equality', () => {
    const node = f`name : ${'John'}`;
    expect(node).toBeInstanceOf(InfixOperationNode);
    const infix = node as InfixOperationNode;
    expect((infix.getLeft() as FieldNode).getName()).toBe('name');
    expect((infix.getRight() as InputNode).getValue()).toBe('John');
  });

  it('parses number value', () => {
    const node = f`age > ${30}`;
    const infix = node as InfixOperationNode;
    expect((infix.getRight() as InputNode).getValue()).toBe(30);
  });

  it('parses boolean true', () => {
    const node = f`active : ${true}`;
    const infix = node as InfixOperationNode;
    expect((infix.getRight() as InputNode).getValue()).toBe(true);
  });

  it('parses boolean false', () => {
    const node = f`deleted : ${false}`;
    const infix = node as InfixOperationNode;
    expect((infix.getRight() as InputNode).getValue()).toBe(false);
  });

  it('parses decimal number', () => {
    const node = f`price : ${19.99}`;
    const infix = node as InfixOperationNode;
    expect((infix.getRight() as InputNode).getValue()).toBe(19.99);
  });

  it('parses negative number', () => {
    const node = f`balance : ${-50}`;
    const infix = node as InfixOperationNode;
    expect((infix.getRight() as InputNode).getValue()).toBe(-50);
  });

  it('escapes single quotes in strings', () => {
    const node = f`name : ${"O'Brien"}`;
    const value = (node as InfixOperationNode).getRight() as InputNode;
    expect(value.getValue()).toBe("O'Brien");
  });

  it('handles string with backslash', () => {
    const node = f`path : ${'C:\\tmp'}`;
    const value = (node as InfixOperationNode).getRight() as InputNode;
    expect(value.getValue()).toBe('C:\\tmp');
  });

  it('serializes array as collection', () => {
    const node = f`status in ${['active', 'pending']}`;
    const str = stringify(node);
    expect(str).toBe("status in ['active', 'pending']");
  });

  it('serializes array of numbers', () => {
    const node = f`ids in ${[1, 2, 3]}`;
    const str = stringify(node);
    expect(str).toBe("ids in ['1', '2', '3']");
  });

  it('multiple interpolations', () => {
    const node = f`age > ${18} and status : ${'active'}`;
    const str = stringify(node);
    expect(str).toBe("age > '18' and status : 'active'");
  });

  it('works with filter()', () => {
    const result = filter(users, f`age > ${28}`);
    expect(result).toHaveLength(2);
    expect(result.map(u => u.name)).toEqual(['John', 'Bob']);
  });

  it('works with stringify()', () => {
    const node = f`age between ${18} and ${65}`;
    const str = stringify(node);
    expect(str).toBe("age between '18' and '65'");
  });

  it('roundtrips correctly', () => {
    const expr = f`age > ${28} and active : ${false}`;
    const str = stringify(expr);
    const reparsed = parse(str);
    expect(stringify(reparsed)).toBe(str);
  });

  it('composes sub-expressions', () => {
    const sub = f`age > ${18}`;
    const query = f`${sub} and active : ${true}`;
    const str = stringify(query);
    expect(str).toBe("age > '18' and active : 'true'");
  });

  it('throws on null value', () => {
    expect(() => f`x : ${null}`).toThrow('null');
  });

  it('throws on undefined value', () => {
    const u: any = undefined;
    expect(() => f`x : ${u}`).toThrow('undefined');
  });

  it('throws on empty template', () => {
    expect(() => f``).toThrow('empty');
  });

  it('dynamic variable usage', () => {
    const minAge = 18;
    const maxAge = 65;
    const status = 'active';
    const node = f`age between ${minAge} and ${maxAge} and status : ${status}`;
    expect(stringify(node)).toBe("age between '18' and '65' and status : 'active'");
  });

  it('works with no interpolations', () => {
    const node = f`x : 'hello'`;
    expect(stringify(node)).toBe("x : 'hello'");
  });

  it('handles zero value', () => {
    const node = f`x : ${0}`;
    const infix = node as InfixOperationNode;
    expect((infix.getRight() as any).getValue()).toBe(0);
  });

  it('handles mixed-type arrays', () => {
    const node = f`x in ${[1, 'a', true]}`;
    const str = stringify(node);
    expect(str).toBe("x in ['1', 'a', 'true']");
  });
});
