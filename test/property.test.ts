import { describe, it, expect } from 'vitest';
import { parse, stringify, matches, build } from '../src/index.js';
import {
  FilterNode, FieldNode, InputNode, PriorityNode, FunctionNode,
  CollectionNode, CollectionLikeNode,
  InfixOperationNode, PrefixOperationNode, PostfixOperationNode,
} from '../src/nodes.js';
import {
  getDefaultOperators, SizeFunction,
  GreaterThanOperator, GreaterThanOrEqualOperator,
  LessThanOperator, LessThanOrEqualOperator,
} from '../src/operators.js';

const ops = getDefaultOperators();
const INFIX = ops.getInfixOperators();
const PREFIX = ops.getPrefixOperators();
const POSTFIX = ops.getPostfixOperators();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const FIELDS = ['a', 'b', 'c', 'd', 'x.y'];
const VALUES = [1, 2, 5, 10, 'p', 'q', true, false];

const ORDERING = [
  GreaterThanOperator, GreaterThanOrEqualOperator,
  LessThanOperator, LessThanOrEqualOperator,
];

function nonBooleanOperand(node: FilterNode): FilterNode {
  return node instanceof InputNode && typeof node.getValue() === 'boolean'
    ? new InputNode(1)
    : node;
}

function makeNode(rand: () => number, depth: number): FilterNode {
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

  if (depth <= 0) {
    return rand() < 0.6 ? new FieldNode(pick(FIELDS)) : new InputNode(pick(VALUES));
  }

  const roll = rand();
  if (roll < 0.34) {
    const op = pick(INFIX);
    let left = makeNode(rand, depth - 1);
    let right = makeNode(rand, depth - 1);
    if (ORDERING.some(T => op instanceof T)) {
      left = nonBooleanOperand(left);
      right = nonBooleanOperand(right);
    }
    return new InfixOperationNode(left, op, right);
  }
  if (roll < 0.46) {
    return new PrefixOperationNode(pick(PREFIX), makeNode(rand, depth - 1));
  }
  if (roll < 0.58) {
    return new PostfixOperationNode(makeNode(rand, depth - 1), pick(POSTFIX));
  }
  if (roll < 0.66) {
    return new PriorityNode(makeNode(rand, depth - 1));
  }
  if (roll < 0.72) {
    return new CollectionNode([new InputNode(pick(VALUES)), new InputNode(pick(VALUES))]);
  }
  if (roll < 0.78) {
    const like = INFIX.find(o => o.getToken() === '~')!;
    const ilike = INFIX.find(o => o.getToken() === '~~')!;
    return new CollectionLikeNode(
      new FieldNode(pick(FIELDS)),
      rand() < 0.5 ? like : ilike,
      [new InputNode('%p%'), new InputNode('q%')]);
  }
  if (roll < 0.84) {
    return new FunctionNode(new SizeFunction(), [new FieldNode(pick(FIELDS))]);
  }
  const gte = ops.getInfixOperators().find(o => o.getToken() === '>:')!;
  const lte = ops.getInfixOperators().find(o => o.getToken() === '<:')!;
  const and = ops.getInfixOperators().find(o => o.getToken() === 'and')!;
  const field = pick(FIELDS);
  const bound = () => nonBooleanOperand(new InputNode(pick(VALUES)));
  return new InfixOperationNode(
    new InfixOperationNode(new FieldNode(field), gte, bound()),
    and,
    new InfixOperationNode(new FieldNode(field), lte, bound()));
}

const ROWS: any[] = [
  {}, { a: 1 }, { a: 2, b: 5 }, { a: 'p', b: 'q' }, { a: true, b: false },
  { a: 1, b: 2, c: 5, d: 10 }, { a: null, b: 1 }, { a: [], b: [1, 2] },
  { a: 'pq', b: 'qp', c: 1 }, { x: { y: 5 } }, { a: 5, b: 5, c: 5, d: 5 },
  { a: 10, b: 1, c: 'p', d: false }, { a: '', b: 0 },
];

function evaluate(node: FilterNode | string, row: unknown): string {
  try { return String(matches(row, node as any)); } catch (e: any) { return 'err:' + e.message.slice(0, 40); }
}

describe('stringify/parse properties over random ASTs', () => {
  const SAMPLES = 3000;

  it('round-trip is stable: stringify(parse(s)) === s', () => {
    const rand = rng(0xC0FFEE);
    const failures: string[] = [];
    let checked = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const node = makeNode(rand, 1 + Math.floor(rand() * 4));
      let s: string;
      try { s = stringify(node); } catch { continue; }
      checked++;
      let again: string;
      try { again = stringify(parse(s)); } catch (e: any) {
        failures.push(`  #${i} PARSE FAILED\n      ${s}\n      ${e.message.slice(0, 90)}`);
        continue;
      }
      if (again !== s) failures.push(`  #${i}\n      once  ${s}\n      twice ${again}`);
    }
    console.log(`  round-trip: ${checked} trees checked, ${failures.length} failure(s)`);
    failures.slice(0, 8).forEach(f => console.log(f));
    expect(failures).toEqual([]);
  }, 60000);

  it('meaning is preserved: the tree and its string agree on every row', () => {
    const rand = rng(0xBADF00D);
    const failures: string[] = [];
    let comparisons = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const node = makeNode(rand, 1 + Math.floor(rand() * 4));
      let s: string;
      try { s = stringify(node); } catch { continue; }
      let reparsed: FilterNode;
      try { reparsed = parse(s); } catch { continue; }
      for (const row of ROWS) {
        const viaTree = evaluate(node, row);
        const viaString = evaluate(reparsed, row);
        comparisons++;
        if (viaTree !== viaString) {
          failures.push(`  #${i} ${s}\n      row   ${JSON.stringify(row)}\n      tree  ${viaTree}\n      strng ${viaString}`);
          break;
        }
      }
    }
    console.log(`  semantics: ${comparisons} comparisons, ${failures.length} mismatch(es)`);
    failures.slice(0, 8).forEach(f => console.log(f));
    expect(failures).toEqual([]);
  }, 60000);
});

describe('known limitation: ordering against a boolean literal', () => {
  it('does not survive a string round trip, and is pinned here deliberately', () => {
    const node = build().field('a').lessThan(true as any).get();
    expect(stringify(node)).toBe("a < 'true'");
    expect(matches({ a: 5 }, node)).toBe(false);
    expect(matches({ a: 5 }, stringify(node))).toBe(true);
  });

  it('equality and truthiness DO survive it', () => {
    expect(matches({ a: true }, stringify(build().field('a').equal(true as any).get()))).toBe(true);
    expect(matches({ a: false }, stringify(build().field('a').equal(false as any).get()))).toBe(true);
    expect(matches({}, stringify(new InputNode(false)))).toBe(false);
    expect(matches({}, stringify(new InputNode(true)))).toBe(true);
  });
});
