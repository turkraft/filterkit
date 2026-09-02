import { describe, it, expect } from 'vitest';
import {
  f, filter, matches, build, stringify, parse,
  SizeFunction, FilterInfixOperator, FilterOperatorsImpl, getDefaultOperators,
  FilterParserImpl, ParseContextImpl, InvalidSyntaxException,
  FilterFunction, FilterPlaceholder, FunctionResolver, PlaceholderResolver,
} from '../src/index.js';

describe('README examples', () => {
  const data = [
    { name: 'John', age: 30, active: true },
    { name: 'Jane', age: 25, active: false },
  ];

  it('opening example', () => {
    const users = data;
    const adults = filter(users, f`age > ${18} and status in ${['active', 'pending']}`);
    expect(adults).toEqual([]);

    const query = build()
      .field('year').between(2020, 2025)
      .and(build().field('brand.name').in(['audi', 'bmw']))
      .get();
    expect(stringify(query))
      .toBe("year between '2020' and '2025' and brand.name in ['audi', 'bmw']");
    expect(encodeURIComponent(stringify(query))).toContain('year%20between');
  });

  it('filtering arrays', () => {
    expect(filter(data, 'age > 28')).toEqual([data[0]]);
    expect(filter(data, f`age > ${28}`)).toEqual([data[0]]);
    expect(matches(data[0], f`active : ${true}`)).toBe(true);
  });

  it('template literals', () => {
    const minAge = 18;
    const statuses = ['active', 'pending'];
    const expr = f`age > ${minAge} and status in ${statuses}`;
    expect(stringify(expr)).toBe("age > '18' and status in ['active', 'pending']");
    expect(() => filter(data, expr)).not.toThrow();
  });

  it('Date interpolation example', () => {
    expect(stringify(f`createdAt > ${new Date('2024-03-05T10:20:30Z')}`))
      .toBe("createdAt > '2024-03-05T10:20:30.000Z'");
  });

  it('Limits example', () => {
    const parser = new FilterParserImpl(undefined, { maxDepth: 100 });
    expect(() => parser.parse("status : 'active'")).not.toThrow();
    expect(() => parser.parse('('.repeat(200) + 'a' + ')'.repeat(200))).toThrow(InvalidSyntaxException);
  });

  it('interpolation escapes quotes', () => {
    const evil = "x' or 1 : 1 or 'a";
    expect(stringify(f`name : ${evil}`)).toBe("name : 'x\\' or 1 : 1 or \\'a'");
    expect(matches({ name: 'anything' }, f`name : ${evil}`)).toBe(false);
  });

  it('building queries', () => {
    const node = build()
      .field('year').greaterThan(2020)
      .and(build().field('category').isNull())
      .get();
    expect(stringify(node)).toBe("year > '2020' and category is null");
  });

  it('complex queries keep their grouping', () => {
    const node = build().field('brand.name').in(['audi', 'bmw'])
      .and(build().field('year').greaterThan(2020)
        .or(build().field('km').lessThan(50000)))
      .get();
    expect(stringify(node))
      .toBe("brand.name in ['audi', 'bmw'] and (year > '2020' or km < '50000')");
  });

  it('functions in the builder', () => {
    const node = build().function(new SizeFunction(), build().field('accidents'))
      .greaterThan(2)
      .and(build().field('year').lessThan(2015))
      .get();
    expect(stringify(node)).toBe("size(accidents) > '2' and year < '2015'");
  });

  it('parsing and stringifying', () => {
    const ast = parse("a > '18' and b : 'c'");
    expect(stringify(ast)).toBe("a > '18' and b : 'c'");
    expect(stringify(parse('age > 5'))).toBe("age > '5'");
  });

  it('parse errors carry a position', () => {
    try {
      parse('a : : b');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(InvalidSyntaxException);
      expect(e.input).toBe('a : : b');
      expect(e.position).toBe(4);
      expect(e.offendingSymbol).toBe(':');
    }
  });

  it('every documented operator parses', () => {
    const operators = [
      'a and b', 'a or b', 'a xor b', 'not a',
      "a : 'b'", "a = 'b'", "a ! 'b'", "a <> 'b'",
      "a > 'b'", "a >: 'b'", "a >= 'b'", "a < 'b'", "a <: 'b'", "a <= 'b'",
      'a between 1 and 5',
      "a ~ 'pattern'", "a like 'pattern'", "a ~~ 'pattern'", "a ilike 'pattern'",
      'a in [1, 2]', 'a not in [1, 2]',
      'a is null', 'a is not null', 'a is empty', 'a is not empty',
    ];
    for (const expression of operators) {
      expect(() => parse(expression), expression).not.toThrow();
    }
  });

  it('operator tokens are case-insensitive', () => {
    expect(stringify(parse('a IS NULL'))).toBe('a is null');
    expect(stringify(parse("a LiKe 'x'"))).toBe("a ~ 'x'");
  });

  it('documented precedence', () => {
    expect(stringify(parse('a and (b or c)'))).toBe('a and (b or c)');
    expect(stringify(parse("(status : 'active' or status : 'pending') and year > '2020'")))
      .toBe("(status : 'active' or status : 'pending') and year > '2020'");
  });

  it('every expression example parses', () => {
    const examples = [
      "status : 'active'",
      'year > 2020 and km < 50000',
      'year between 2020 and 2025',
      "color : 'red' or color : 'blue'",
      "brand.name : 'audi'",
      "brand.manufacturer.country : 'germany'",
      'brand is not null',
      "status in ['active', 'pending']",
      'size(accidents) > 2',
      'accidents is empty',
      'ratings is not empty',
      "name ~ '%john%'",
      "name ~~ 'JOHN'",
      "email ~ 'admin%'",
      "filename ~ '%.pdf'",
      "name ~ ['%john%', '%doe%']",
      '(year > 2020 and km < 30000) or (year > 2018 and km < 10000)',
      "brand.name in ['audi', 'bmw'] and year > 2020 and accidents is empty and color ! 'white'",
    ];
    for (const expression of examples) {
      expect(() => parse(expression), expression).not.toThrow();
    }
  }, 60000);

  it('like against a collection matches any pattern', () => {
    expect(matches({ name: 'john smith' }, "name ~ ['%john%', '%doe%']")).toBe(true);
    expect(matches({ name: 'jane doe' }, "name ~ ['%john%', '%doe%']")).toBe(true);
    expect(matches({ name: 'bob brown' }, "name ~ ['%john%', '%doe%']")).toBe(false);
  });

  it('in-memory evaluation options', () => {
    const row = { owner: 'u-1', name: 'abcd' };
    class CurrentUser extends FilterPlaceholder { constructor() { super('me'); } }
    class LengthFunction extends FilterFunction { constructor() { super('len'); } }
    PlaceholderResolver.setResolver(name => name === 'me' ? new CurrentUser() : null);
    FunctionResolver.setResolver(name => name === 'len' ? new LengthFunction() : null);
    try {
      expect(matches(row, 'owner : `me`', { placeholders: { me: 'u-1' } })).toBe(true);
      expect(matches(row, 'owner : `me`', { placeholders: { me: 'u-2' } })).toBe(false);
      expect(matches(row, 'len(name) > 3', {
        functions: { len: ([value]: unknown[]) => String(value).length },
      })).toBe(true);
    } finally {
      PlaceholderResolver.setResolver(() => null);
      FunctionResolver.setResolver(() => null);
    }
  });

  it('size() over the documented shapes', () => {
    expect(matches({ x: 'abc' }, 'size(x) : 3')).toBe(true);
    expect(matches({ x: [1, 2] }, 'size(x) : 2')).toBe(true);
    expect(matches({ x: new Set([1]) }, 'size(x) : 1')).toBe(true);
    expect(matches({ x: { a: 1, b: 2 } }, 'size(x) : 2')).toBe(true);
  });

  it('today() is a date', () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(matches({ createdAt: new Date(midnight.getTime() + 1000) }, 'createdAt > today()')).toBe(true);
  });

  it('documented comparison rules', () => {
    expect(matches({ a: null }, 'a > 1')).toBe(false);
    expect(matches({ a: null }, 'a < 1')).toBe(false);
    expect(matches({ a: 10 }, "a > '9'")).toBe(true);
    expect(matches({ a: new Date('2020-06-01') }, "a > '2020-01-01'")).toBe(true);
    expect(matches({ a: 'abc' }, "a < 'abd'")).toBe(true);
  });

  it('custom operators', () => {
    class ContainsOperator extends FilterInfixOperator {
      constructor() { super('contains', 100); }
    }
    const ops = new FilterOperatorsImpl(
      getDefaultOperators().getPrefixOperators(),
      [...getDefaultOperators().getInfixOperators(), new ContainsOperator()],
      getDefaultOperators().getPostfixOperators(),
    );
    const parser = new FilterParserImpl(ops);
    expect(() => parser.parse("name contains 'hello'")).not.toThrow();
    expect(() => parse("name contains 'hello'")).toThrow();
  });

  it('custom functions and placeholders keep the built-ins', () => {
    class LengthFunction extends FilterFunction { constructor() { super('len'); } }
    class CurrentUser extends FilterPlaceholder { constructor() { super('me'); } }
    FunctionResolver.setResolver(name => name === 'len' ? new LengthFunction() : null);
    PlaceholderResolver.setResolver(name => name === 'me' ? new CurrentUser() : null);
    try {
      expect(() => parse('len(a) > 2')).not.toThrow();
      expect(() => parse('size(a) > 2')).not.toThrow();
      expect(() => parse('a : `me`')).not.toThrow();
      expect(() => parse('a : `hello`')).not.toThrow();
    } finally {
      FunctionResolver.setResolver(() => null);
      PlaceholderResolver.setResolver(() => null);
    }
  });

  it('field and node mapping', () => {
    const ctx = new ParseContextImpl(
      (field) => field === 'dbName' ? 'clientName' : field,
      (node) => node,
    );
    expect(stringify(parse("dbName : 'john'", ctx))).toBe("clientName : 'john'");
  });

  it('strict mode example', () => {
    const parser = new FilterParserImpl(undefined, { strict: true });
    expect(() => parser.parse("status : 'active'")).not.toThrow();
  });
});
