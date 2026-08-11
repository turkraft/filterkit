import { describe, it, expect } from 'vitest';
import { FilterParserImpl } from '../src/parser.js';
import { FilterStringTransformer } from '../src/transformer.js';
import { FunctionResolver, PlaceholderResolver } from '../src/parser.js';
import { SizeFunction, TodayFunction, HelloWorldPlaceholder } from '../src/operators.js';

const parser = new FilterParserImpl();
const transformer = new FilterStringTransformer();

FunctionResolver.setResolver((name) => {
  if (name === 'size') return new SizeFunction();
  if (name === 'today') return new TodayFunction();
  throw new Error(`Unrecognized function \`${name}\``);
});
PlaceholderResolver.setResolver((name) => {
  if (name === 'hello') return new HelloWorldPlaceholder();
  throw new Error(`Unrecognized placeholder \`${name}\``);
});

function roundTrip(input: string): string {
  const node = parser.parse(input);
  return transformer.transform(node);
}

function assertRoundTrip(input: string, expected?: string) {
  const result = roundTrip(input);
  if (expected !== undefined) {
    expect(result).toBe(expected);
  } else {
    expect(result).toBe(input);
  }
}

describe('Parser round-trip compatibility', () => {
  describe('exact round-trips', () => {
    const cases: [string, string?][] = [
      ["name : 'john'"],
      ["age > '18'", "age > '18'"],
      ["active : 'true'", "active : 'true'"],
      ["deleted : 'false'", "deleted : 'false'"],
      ["price : '19.99'", "price : '19.99'"],
      ["score >: '5'", "score >: '5'"],
      ["score : '5'", "score : '5'"],
    ];

    for (const [input, expected] of cases) {
      it(input, () => assertRoundTrip(input, expected));
    }
  });

  describe('logical operators', () => {
    it('and', () => assertRoundTrip("a : '1' and b : '2'"));
    it('or', () => assertRoundTrip("a : '1' or b : '2'"));
    it('not', () => assertRoundTrip("not a : '1'"));
    it('xor', () => assertRoundTrip("a : '1' xor b : '2'"));
    it('parentheses', () => assertRoundTrip("(a : '1' or b : '2') and c : '3'"));
  });

  describe('collections', () => {
    it('in list', () => assertRoundTrip("color in ['red', 'blue']"));
    it('empty list', () => assertRoundTrip('x in []'));
  });

  describe('nested fields', () => {
    it('one level', () => assertRoundTrip("user.name : 'john'"));
    it('two levels', () => assertRoundTrip("a.b.c : 'deep'"));
  });

  describe('postfix operators', () => {
    it('is null', () => assertRoundTrip('name is null'));
    it('is not null', () => assertRoundTrip('name is not null'));
    it('is empty', () => assertRoundTrip('items is empty'));
    it('is not empty', () => assertRoundTrip('items is not empty'));
  });

  describe('between', () => {
    it('between numbers', () => assertRoundTrip("age between '18' and '65'"));
    it('between in context', () => assertRoundTrip(
      "age between '18' and '65' and active : 'true'"
    ));
  });

  describe('complex expressions', () => {
    it('deep nesting', () => assertRoundTrip(
      "not (a : '1' or (b : '2' and c : '3'))"
    ));
    it('mixed operators', () => assertRoundTrip(
      "status in ['active', 'pending'] and age > '18' and deleted : 'false'"
    ));
    it('like operator', () => assertRoundTrip("name ~ 'Jo%'"));
    it('insensitive like', () => assertRoundTrip("name ~~ 'jo%'"));
  });

  describe('double parse (ast stability)', () => {
    function doubleParse(input: string): string {
      const first = parser.parse(input);
      const str = transformer.transform(first);
      const second = parser.parse(str);
      return transformer.transform(second);
    }

    it('simple expression', () => {
      expect(doubleParse("name : 'john'")).toBe("name : 'john'");
    });

    it('complex expression', () => {
      const input = "status in ['active', 'pending'] and age > '18' and deleted : 'false'";
      expect(doubleParse(input)).toBe(input);
    });

    it('with parentheses', () => {
      const input = "(a : '1' or b : '2') and c : '3'";
      expect(doubleParse(input)).toBe(input);
    });

    it('between', () => {
      expect(doubleParse("age between '18' and '65'")).toBe("age between '18' and '65'");
    });
  });

  describe('case insensitivity', () => {
    it('uppercase AND', () => {
      const node = parser.parse("a : '1' AND b : '2'");
      const str = transformer.transform(node);
      expect(str).toBe("a : '1' and b : '2'");
    });

    it('uppercase OR', () => {
      const node = parser.parse("a : '1' OR b : '2'");
      const str = transformer.transform(node);
      expect(str).toBe("a : '1' or b : '2'");
    });
  });
});
