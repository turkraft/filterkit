import { describe, it, expect, beforeAll } from 'vitest';
import { FilterParserImpl, FunctionResolver, PlaceholderResolver } from '../src/parser.js';
import { FilterStringTransformer } from '../src/transformer.js';
import { FilterBuilder } from '../src/builder.js';
import { HelloWorldPlaceholder, SizeFunction, TodayFunction } from '../src/operators.js';

const parser = new FilterParserImpl();
const transformer = new FilterStringTransformer();
const fb = new FilterBuilder();

beforeAll(() => {
  FunctionResolver.setResolver((name) => {
    if (name === 'size') return new SizeFunction();
    if (name === 'today') return new TodayFunction();
    throw new Error(`Unrecognized function \`${name}\``);
  });
  PlaceholderResolver.setResolver((name) => {
    if (name === 'hello') return new HelloWorldPlaceholder();
    throw new Error(`Unrecognized placeholder \`${name}\``);
  });
});

function convert(input: string): string {
  return transformer.transform(parser.parse(input));
}

function assertRoundtrip(input: string): void {
  const p1 = convert(input);
  const p2 = convert(p1);
  expect(p2).toBe(p1);
}

describe('deterministic roundtrip', () => {
  const inputs = [
    "a:b",
    "a:b and c:d",
    "not a",
    "not a and b",
    "not (a and b)",
    "a is empty",
    "a > b > c",
    "a and b or c and d",
    "a or b and c or d",
    "a and not b : c and d or (x.y.z and 1)",
    "size(collection)",
    "[a, b, c]",
    "today([x,[y,z]], `hello`) : abc or 1 ! 2",
    "x in [x, y, z]",
    "x is null",
    "x is not null",
    "x is empty",
    "[x, y, z] is empty",
    "c is not empty",
    "(a or b) and c",
    "age between 18 and 65",
    "price between 9.99 and 99.99",
    "name between 'A' and 'M'",
    "size(orders) between 1 and 10",
    "address.zip between 10000 and 99999",
    "a between b and c",
    "age between 18 and 65 and name : 'John'",
    "age between 18 and 65 or name : 'John'",
    "not (age between 18 and 65)",
    "(age between 18 and 65) and status : 'active'",
    "x between 1 and 2 or x between 3 and 4",
    "a between b and c and d between e and f",
    "age between 1 and today()",
    "age between 1 and 2 and status between 'A' and 'Z'",
    "age between '1' and '2'",
    "name ~ ['A%', 'B%', 'C%']",
    "name ~ ['%test%']",
    "name ~ [a, b, c]",
    "name ~~ ['A%', 'B%']",
    "name ~ ['%_test']",
    "name ~ ['100%%']",
    "name ~~ ['TE%', 'ST%']",
    "x ~~ ['a%']",
    "a : 1 xor b : 2",
    "a xor b or c",
    "a and b xor c",
    "(a or b) xor c",
  ];

  for (const input of inputs) {
    it(input, () => assertRoundtrip(input));
  }
});
