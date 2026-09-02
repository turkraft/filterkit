import { describe, it, expect } from 'vitest';
import {
  parse, stringify, build, filter, matches, f, expr,
  FilterParserImpl, ParseContextImpl, InvalidSyntaxException,
  FilterInfixOperator, FilterOperatorsImpl, getDefaultOperators,
  FunctionResolver, PlaceholderResolver, FilterFunction, FilterPlaceholder,
  CollectionLikeNode, InfixOperationNode, FieldNode, InputNode,
  GreaterThanOrEqualOperator, LessThanOrEqualOperator, AndOperator, NotOperator,
} from '../src/index.js';

const roundTrip = (s: string) => stringify(parse(s));

describe('stringify keeps operator precedence', () => {
  const b = build();

  it('parenthesises a lower-priority left operand', () => {
    const node = b.field('a').equal(1).or(b.field('b').equal(2))
      .and(b.field('c').equal(3)).get();
    expect(stringify(node)).toBe("(a : '1' or b : '2') and c : '3'");
    expect(roundTrip(stringify(node))).toBe(stringify(node));
  });

  it('the README "complex query" keeps its grouping', () => {
    const node = build().field('brand.name').in(['audi', 'bmw'])
      .and(build().field('year').greaterThan(2020)
        .or(build().field('km').lessThan(50000)))
      .get();
    expect(stringify(node)).toBe(
      "brand.name in ['audi', 'bmw'] and (year > '2020' or km < '50000')"
    );
    expect(filter([{ brand: { name: 'ford' }, year: 2024, km: 10 }], stringify(node))).toEqual([]);
  });

  it('parenthesises the operand of a prefix not', () => {
    const node = b.field('a').equal(1).and(b.field('b').equal(2)).not().get();
    expect(stringify(node)).toBe("not (a : '1' and b : '2')");
    expect(matches({ a: 1, b: 9 }, stringify(node))).toBe(true);
  });

  it('leaves a higher-priority operand alone', () => {
    expect(stringify(b.field('a').equal(1).not().get())).toBe("not a : '1'");
    expect(stringify(b.and(b.field('a').equal(1), b.field('b').equal(2)).get()))
      .toBe("a : '1' and b : '2'");
  });

  it('parenthesises an equal-priority right operand', () => {
    const node = b.field('a').equal(1).and(b.field('b').equal(2).and(b.field('c').equal(3))).get();
    expect(stringify(node)).toBe("a : '1' and (b : '2' and c : '3')");
  });

  it('still renders between, and it survives a round trip', () => {
    const node = b.field('x').between(1, 10).and(b.field('y').equal(2)).get();
    expect(stringify(node)).toBe("x between '1' and '10' and y : '2'");
    expect(roundTrip(stringify(node))).toBe(stringify(node));
  });

  it('parenthesises a not around a between', () => {
    const node = b.field('x').between(1, 10).not().get();
    expect(stringify(node)).toBe("not x between '1' and '10'");
    expect(matches({ x: 5 }, stringify(node))).toBe(false);
    expect(matches({ x: 50 }, stringify(node))).toBe(true);
  });
});

describe('case-insensitive like', () => {
  it('ignores case on both sides', () => {
    expect(matches({ n: 'john doe' }, "n ~~ 'JOHN%'")).toBe(true);
    expect(matches({ n: 'JOHN DOE' }, "n ~~ 'john%'")).toBe(true);
    expect(matches({ n: 'JoHn DoE' }, "n ~~ '%DoE'")).toBe(true);
    expect(matches({ n: 'jane' }, "n ~~ 'JOHN%'")).toBe(false);
  });

  it('stays case-sensitive for plain like', () => {
    expect(matches({ n: 'john doe' }, "n ~ 'JOHN%'")).toBe(false);
    expect(matches({ n: 'john doe' }, "n ~ 'john%'")).toBe(true);
  });
});

describe('date comparison', () => {
  it('orders Date values against ISO strings', () => {
    expect(matches({ d: new Date('2020-06-01') }, "d > '2020-01-01'")).toBe(true);
    expect(matches({ d: new Date('2019-01-01') }, "d > '2020-01-01'")).toBe(false);
    expect(matches({ d: new Date('2019-01-01') }, "d < '2020-01-01'")).toBe(true);
  });

  it('orders two Date values', () => {
    expect(matches({ d: new Date('2020-06-01') }, "d > '2020-01-01T00:00:00Z'")).toBe(true);
  });

  it('orders ISO strings', () => {
    expect(matches({ d: '2020-06-01' }, "d > '2020-01-01'")).toBe(true);
    expect(matches({ d: '2019-06-01' }, "d > '2020-01-01'")).toBe(false);
  });

  it('compares dates for equality by instant', () => {
    expect(matches({ d: new Date('2020-01-01') }, "d : '2020-01-01'")).toBe(true);
    expect(matches({ d: new Date('2020-01-02') }, "d : '2020-01-01'")).toBe(false);
  });

  it('does not order a date against a non-date', () => {
    expect(matches({ d: new Date('2020-06-01') }, "d > 'banana'")).toBe(false);
    expect(matches({ d: new Date('2020-06-01') }, "d < 'banana'")).toBe(false);
  });

  it('between works on dates', () => {
    expect(matches({ d: new Date('2020-06-01') }, "d between '2020-01-01' and '2020-12-31'")).toBe(true);
    expect(matches({ d: new Date('2021-06-01') }, "d between '2020-01-01' and '2020-12-31'")).toBe(false);
  });
});

describe('round trip through stringify preserves matching', () => {
  it('booleans', () => {
    expect(matches({ active: true }, 'active : true')).toBe(true);
    expect(matches({ active: true }, roundTrip('active : true'))).toBe(true);
    expect(matches({ active: false }, roundTrip('active : true'))).toBe(false);
    expect(matches({ active: false }, roundTrip('active : false'))).toBe(true);
  });

  it('numbers', () => {
    expect(matches({ age: 30 }, roundTrip('age > 5'))).toBe(true);
    expect(matches({ age: 3 }, roundTrip('age > 5'))).toBe(false);
  });
});

describe('is empty', () => {
  it('matches Spring Filter for non-collection values', () => {
    expect(matches({ a: [] }, 'a is empty')).toBe(true);
    expect(matches({ a: [1] }, 'a is empty')).toBe(false);
    expect(matches({ a: '' }, 'a is empty')).toBe(true);
    expect(matches({ a: {} }, 'a is empty')).toBe(true);
    expect(matches({ a: new Map() }, 'a is empty')).toBe(true);
    expect(matches({}, 'a is empty')).toBe(true);
    expect(matches({ a: new Date() }, 'a is empty')).toBe(false);
    expect(matches({ a: 0 }, 'a is empty')).toBe(false);
    expect(matches({ a: false }, 'a is empty')).toBe(false);
  });
});

describe('built-in functions and placeholders', () => {
  it('today() evaluates', () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(matches({ d: new Date(midnight.getTime() + 3600_000) }, 'd > today()')).toBe(true);
    expect(matches({ d: new Date(midnight.getTime() - 3600_000) }, 'd > today()')).toBe(false);
  });

  it('size() evaluates', () => {
    expect(matches({ tags: [1, 2, 3] }, 'size(tags) > 2')).toBe(true);
    expect(matches({ tags: [1] }, 'size(tags) > 2')).toBe(false);
  });

  it('placeholders take a value from options', () => {
    expect(matches({ owner: 'jane' }, 'owner : `hello`', { placeholders: { hello: 'jane' } })).toBe(true);
    expect(matches({ owner: 'bob' }, 'owner : `hello`', { placeholders: { hello: 'jane' } })).toBe(false);
  });

  it('placeholders without a value fail loudly', () => {
    expect(() => matches({ owner: 'jane' }, 'owner : `hello`')).toThrow(/has no value/);
  });

  it('custom function implementations can be supplied', () => {
    class LengthFunction extends FilterFunction { constructor() { super('len'); } }
    FunctionResolver.setResolver((name) => (name === 'len' ? new LengthFunction() : null));
    try {
      expect(matches({ n: 'abcd' }, 'len(n) > 3', {
        functions: { len: (args) => String(args[0]).length },
      })).toBe(true);
      expect(() => matches({ n: 'abcd' }, 'len(n) > 3')).toThrow(/Unsupported function: len/);
    } finally {
      FunctionResolver.setResolver(() => null);
    }
  });
});

describe('like against a collection of patterns', () => {
  it('parses to a CollectionLikeNode, as Spring Filter does', () => {
    expect(parse("name ~ ['%john%', '%doe%']")).toBeInstanceOf(CollectionLikeNode);
  });

  it('matches if any pattern matches', () => {
    const data = [{ name: 'John Smith' }, { name: 'Jane Doe' }, { name: 'Bob Brown' }];
    expect(filter(data, "name ~ ['%John%', '%Doe%']")).toEqual([
      { name: 'John Smith' }, { name: 'Jane Doe' },
    ]);
  });

  it('honours case-insensitivity', () => {
    expect(matches({ name: 'JOHN' }, "name ~~ ['%john%']")).toBe(true);
    expect(matches({ name: 'JOHN' }, "name ~ ['%john%']")).toBe(false);
  });

  it('round-trips', () => {
    expect(roundTrip("name ~ ['%a%', '%b%']")).toBe("name ~ ['%a%', '%b%']");
  });

  it('leaves an empty collection alone', () => {
    expect(parse('name ~ []')).toBeInstanceOf(InfixOperationNode);
  });
});

describe('postfix operators do not end the expression', () => {
  const accepted = [
    'a is null and b : 1',
    'a is not null and b : 1',
    'a is empty or b : 1',
    'a is null and b is null',
    'not a is null and b : 1',
    'a is null and b is not empty or c : 2',
    'a : `hello` and b : 1',
    '`hello` is null',
    'size(a) is null and b : 1',
  ];

  for (const input of accepted) {
    it(`parses \`${input}\``, () => {
      expect(() => parse(input)).not.toThrow();
    });
  }

  it('binds correctly', () => {
    expect(stringify(parse('a is null and b : 1'))).toBe("a is null and b : '1'");
    expect(matches({ a: null, b: 1 }, 'a is null and b : 1')).toBe(true);
    expect(matches({ a: 1, b: 1 }, 'a is null and b : 1')).toBe(false);
    expect(matches({ a: null, b: 2 }, 'a is null and b : 1')).toBe(false);
  });

  it('not binds tighter than and', () => {
    expect(matches({ a: 1, b: 1 }, 'not a is null and b : 1')).toBe(true);
    expect(matches({ a: null, b: 1 }, 'not a is null and b : 1')).toBe(false);
  });

  it('round-trips', () => {
    for (const input of accepted) {
      const once = stringify(parse(input));
      expect(stringify(parse(once))).toBe(once);
    }
  });
});

describe('parser hardening', () => {
  it('rejects an unterminated string literal', () => {
    expect(() => parse("a : 'unterminated")).toThrow(InvalidSyntaxException);
    expect(() => parse("a : 'unterminated")).toThrow(/Unterminated string/);
  });

  it('reports the offending position', () => {
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

  it('turns runaway nesting into a catchable error', () => {
    const deep = '('.repeat(5000) + 'a : 1' + ')'.repeat(5000);
    expect(() => parse(deep)).toThrow(InvalidSyntaxException);
    expect(() => parse(deep)).toThrow(/nesting is too deep/);
  });

  it('still parses reasonable nesting', () => {
    const ok = '('.repeat(100) + 'a : 1' + ')'.repeat(100);
    expect(() => parse(ok)).not.toThrow();
  });

  it('does not walk the prototype chain', () => {
    expect(matches({}, "constructor.name : 'Object'")).toBe(false);
    expect(matches({}, '__proto__ is not null')).toBe(false);
    expect(matches({}, '__proto__ is null')).toBe(true);
  });
});

describe('node mapper is applied once per node', () => {
  it('does not re-map', () => {
    const seen: unknown[] = [];
    const ctx = new ParseContextImpl(undefined, (node) => { seen.push(node); return node; });
    new FilterParserImpl().parse("a : '1' and b : '2'", ctx);
    expect(seen.length).toBe(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('a wrapping mapper is not applied twice', () => {
    let wraps = 0;
    const ctx = new ParseContextImpl(undefined, (node) => {
      if (node instanceof FieldNode) wraps++;
      return node;
    });
    new FilterParserImpl().parse('a', ctx);
    expect(wraps).toBe(1);
  });
});

describe('public API accepts parsed nodes', () => {
  const data = [
    { name: 'John', age: 30, active: true },
    { name: 'Jane', age: 25, active: false },
  ];

  it('filter() takes a template literal', () => {
    expect(filter(data, f`age > ${28}`)).toEqual([data[0]]);
  });

  it('matches() takes a template literal', () => {
    expect(matches(data[0], f`active : ${true}`)).toBe(true);
    expect(matches(data[1], f`active : ${true}`)).toBe(false);
  });

  it('filter() still takes a string', () => {
    expect(filter(data, 'age > 28')).toEqual([data[0]]);
  });

  it('parse() takes a ParseContext', () => {
    const ctx = new ParseContextImpl((field) => (field === 'dbName' ? 'clientName' : field));
    expect(stringify(parse("dbName : 'john'", ctx))).toBe("clientName : 'john'");
    expect(stringify(expr("dbName : 'john'", ctx))).toBe("clientName : 'john'");
  });
});

describe('custom functions supplement the built-ins', () => {
  class LengthFunction extends FilterFunction { constructor() { super('len'); } }
  class CurrentUser extends FilterPlaceholder { constructor() { super('me'); } }

  it('registering a resolver does not disable size()', () => {
    FunctionResolver.setResolver((name) => (name === 'len' ? new LengthFunction() : null));
    PlaceholderResolver.setResolver((name) => (name === 'me' ? new CurrentUser() : null));
    try {
      expect(stringify(parse('len(a) > 2'))).toBe("len(a) > '2'");
      expect(stringify(parse('size(tags) > 2'))).toBe("size(tags) > '2'");
      expect(stringify(parse('a : `me`'))).toBe('a : `me`');
      expect(stringify(parse('a : `hello`'))).toBe('a : `hello`');
      expect(() => parse('nope(a)')).toThrow(/Unrecognized function/);
    } finally {
      FunctionResolver.setResolver(() => null);
      PlaceholderResolver.setResolver(() => null);
    }
  });
});

describe('the default operator set cannot be mutated by callers', () => {
  it('rejects a push into the returned array', () => {
    const infix = getDefaultOperators().getInfixOperators();
    const before = infix.length;
    expect(() => infix.push(infix[0])).toThrow();
    expect(getDefaultOperators().getInfixOperators().length).toBe(before);
  });

  it('a custom operator set can still be derived from it', () => {
    class ContainsOperator extends FilterInfixOperator {
      constructor() { super('contains', 100); }
    }
    const ops = new FilterOperatorsImpl(
      getDefaultOperators().getPrefixOperators(),
      [...getDefaultOperators().getInfixOperators(), new ContainsOperator()],
      getDefaultOperators().getPostfixOperators(),
    );
    const parser = new FilterParserImpl(ops);
    expect(stringify(parser.parse("name contains 'hello'"))).toBe("name contains 'hello'");
    expect(getDefaultOperators().getInfixOperators()).not.toContainEqual(new ContainsOperator());
  });
});

describe('audit follow-ups', () => {
  it('a between shape is rendered and parenthesised consistently', () => {
    const b = build();
    const node = b.priority(b.field('x')).get()
      .infix(getDefaultOperators().getInfixOperatorByType(GreaterThanOrEqualOperator), new InputNode(1))
      .infix(
        getDefaultOperators().getInfixOperatorByType(AndOperator),
        new FieldNode('x').infix(
          getDefaultOperators().getInfixOperatorByType(LessThanOrEqualOperator),
          new InputNode(5),
        ),
      );
    expect(stringify(node)).toBe("(x) >: '1' and x <: '5'");
    const negated = stringify(node.prefix(getDefaultOperators().getPrefixOperatorByType(NotOperator)));
    expect(negated).toBe("not ((x) >: '1' and x <: '5')");
    expect(stringify(parse(negated))).toBe(negated);
  });

  it('an error message does not embed a huge input', () => {
    const big = 'a : 1 and '.repeat(20000) + '@';
    try {
      parse(big);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(InvalidSyntaxException);
      expect(e.message.length).toBeLessThan(200);
      expect(e.input).toBe(big);
    }
  }, 60000);

  it('a throwing custom resolver keeps its own message', () => {
    FunctionResolver.setResolver((name) => {
      if (name === 'len') return new (class extends FilterFunction {
        constructor() { super('len'); }
      })();
      throw new Error(`app does not support \`${name}\``);
    });
    try {
      expect(() => parse('lenn(a)')).toThrow(/app does not support `lenn`/);
      expect(() => parse('size(a)')).not.toThrow();
      expect(() => parse('len(a)')).not.toThrow();
    } finally {
      FunctionResolver.setResolver(() => null);
    }
  });

  it('orders a Date against a raw epoch number', () => {
    const now = Date.now();
    expect(matches({ d: new Date(now) }, `d > ${now - 1000}`)).toBe(true);
    expect(matches({ d: new Date(now) }, `d < ${now - 1000}`)).toBe(false);
    expect(matches({ d: new Date(now) }, `d : ${now}`)).toBe(true);
    expect(matches({ n: 5 }, 'n > 3')).toBe(true);
    expect(matches({ n: 3 }, 'n > 5')).toBe(false);
  });
});

describe('dates in expression strings', () => {
  const d = new Date('2024-03-05T10:20:30.000Z');

  it('stringify renders a Date as ISO-8601, not Date.toString()', () => {
    expect(stringify(build().field('at').greaterThan(d as any).get()))
      .toBe("at > '2024-03-05T10:20:30.000Z'");
  });

  it('the template tag interpolates a Date', () => {
    expect(stringify(f`at > ${d}`)).toBe("at > '2024-03-05T10:20:30.000Z'");
    expect(() => f`at > ${new Date('nope')}`).toThrow(/invalid Date/);
  });

  it('a Date survives the round trip through a string', () => {
    const expression = stringify(f`at > ${d}`);
    expect(matches({ at: new Date('2024-06-01') }, expression)).toBe(true);
    expect(matches({ at: new Date('2024-01-01') }, expression)).toBe(false);
    expect(matches({ at: '2024-06-01' }, expression)).toBe(true);
  });

  it('a between over Dates round-trips', () => {
    const lo = new Date('2024-01-01T00:00:00.000Z');
    const hi = new Date('2024-12-31T00:00:00.000Z');
    const expression = stringify(build().field('at').between(lo as any, hi as any).get());
    expect(expression).toBe("at between '2024-01-01T00:00:00.000Z' and '2024-12-31T00:00:00.000Z'");
    expect(stringify(parse(expression))).toBe(expression);
    expect(matches({ at: new Date('2024-06-01') }, expression)).toBe(true);
    expect(matches({ at: new Date('2025-06-01') }, expression)).toBe(false);
  });

  it('an invalid Date does not crash stringify', () => {
    expect(() => stringify(build().field('at').equal(new Date('nope') as any).get())).not.toThrow();
  });
});

describe('numeric coercion no longer leans on JavaScript quirks', () => {
  it('an empty string is not the number zero', () => {
    expect(matches({ a: 0 }, "a : ''")).toBe(false);
    expect(matches({ a: '' }, 'a : 0')).toBe(false);
    expect(matches({ a: '' }, "a > '-1'")).toBe(false);
  });

  it('a non-numeric value falls back to text ordering, not Number()', () => {
    expect(matches({ a: [] }, 'a > -1')).toBe(false);
    expect(matches({ a: [] }, 'a < -1')).toBe(true);
  });

  it('real numeric strings still coerce', () => {
    expect(matches({ a: 1 }, "a : '1'")).toBe(true);
    expect(matches({ a: '1' }, 'a : 1')).toBe(true);
    expect(matches({ a: '10' }, "a > '9'")).toBe(true);
    expect(matches({ a: ' 42 ' }, 'a : 42')).toBe(true);
  });
});

describe('built-ins do not depend on import-time registration', () => {
  it('resolve from a bare parser without touching the top-level module', async () => {
    const { FilterParserImpl: BareParser } = await import('../src/parser.js');
    const parser = new BareParser();
    expect(() => parser.parse('size(a) > 1')).not.toThrow();
    expect(() => parser.parse('a > today()')).not.toThrow();
    expect(() => parser.parse('a : `hello`')).not.toThrow();
    expect(() => parser.parse('nope(a)')).toThrow(/Unrecognized function/);
    expect(() => parser.parse('a : `nope`')).toThrow(/Unrecognized placeholder/);
  });
});

describe('between over non-field operands', () => {
  it('collapses a between over a function call', () => {
    expect(stringify(parse('size(a) between 1 and 5'))).toBe("size(a) between '1' and '5'");
    expect(roundTrip(stringify(parse('size(a) between 1 and 5')))).toBe("size(a) between '1' and '5'");
    expect(matches({ a: [1, 2, 3] }, 'size(a) between 1 and 5')).toBe(true);
    expect(matches({ a: [] }, 'size(a) between 1 and 5')).toBe(false);
  });

  it('does not merge two different function calls', () => {
    expect(stringify(parse('size(a) >= 1 and size(b) <= 5')))
      .toBe("size(a) >: '1' and size(b) <: '5'");
    expect(stringify(parse('size(a) >= 1 and size(a) <= 5')))
      .toBe("size(a) between '1' and '5'");
  });

  it('handles a placeholder and a parenthesised operand', () => {
    expect(stringify(parse('`hello` between 1 and 5'))).toBe("`hello` between '1' and '5'");
    expect(stringify(parse('(a) between 1 and 5'))).toBe("(a) between '1' and '5'");
    expect(stringify(parse('a.b.c between 1 and 5'))).toBe("a.b.c between '1' and '5'");
  });
});

describe('LIKE wildcard escaping in the in-memory engine', () => {
  const escapedPercent = String.raw`a ~ '50\%'`;
  const escapedUnderscore = String.raw`a ~ 'x\_y'`;

  it('treats \% as a literal percent', () => {
    expect(matches({ a: '50%' }, escapedPercent)).toBe(true);
    expect(matches({ a: '50off' }, escapedPercent)).toBe(false);
    expect(matches({ a: '50' }, escapedPercent)).toBe(false);
  });

  it('treats \_ as a literal underscore', () => {
    expect(matches({ a: 'x_y' }, escapedUnderscore)).toBe(true);
    expect(matches({ a: 'xay' }, escapedUnderscore)).toBe(false);
  });

  it('still treats bare % and _ as wildcards', () => {
    expect(matches({ a: '50off' }, "a ~ '50%'")).toBe(true);
    expect(matches({ a: 'xay' }, "a ~ 'x_y'")).toBe(true);
  });

  it('treats regex metacharacters in a pattern literally', () => {
    expect(matches({ a: 'a.b' }, "a ~ 'a.b'")).toBe(true);
    expect(matches({ a: 'axb' }, "a ~ 'a.b'")).toBe(false);
    expect(matches({ a: 'a$b' }, "a ~ 'a$b'")).toBe(true);
    expect(matches({ a: 'a(b' }, "a ~ 'a(b'")).toBe(true);
  });

  it('% spans newlines', () => {
    expect(matches({ a: 'a\nb' }, "a ~ 'a%b'")).toBe(true);
  });
});

describe('error excerpts stay readable wherever the fault is', () => {
  const positionOf = (input: string) => {
    try { parse(input); return null; } catch (e: any) { return e; }
  };

  it('shows the whole input when it is short', () => {
    expect(positionOf('a : : b').message).toContain('a : : b');
  });

  it('windows a long input around the fault', () => {
    for (const input of ['@' + 'x'.repeat(200), 'a : 1 and '.repeat(30) + '@', 'a'.repeat(60) + ' @ ' + 'b'.repeat(60)]) {
      const error = positionOf(input);
      expect(error.message.length).toBeLessThan(160);
      expect(error.input).toBe(input);
      expect(typeof error.position).toBe('number');
    }
  });
});

describe('evaluation semantics measured against the reference engine', () => {
  it('orders strings by code point, not by locale', () => {
    expect(matches({ a: 'p' }, "a >= 'PQ'")).toBe(true);
    expect(matches({ a: 'p' }, "a < 'PQ'")).toBe(false);
    expect(matches({ a: 'a' }, "a > 'B'")).toBe(true);
    expect(matches({ a: 'B' }, "a < 'a'")).toBe(true);
  });

  it('reads the boolean words Spring converts, minus the numeric ones', () => {
    expect(matches({ a: true }, "a : 'true'")).toBe(true);
    expect(matches({ a: true }, "a : 'yes'")).toBe(true);
    expect(matches({ a: true }, "a : 'on'")).toBe(true);
    expect(matches({ a: false }, "a : 'no'")).toBe(true);
    expect(matches({ a: false }, "a : 'off'")).toBe(true);
    expect(matches({ a: true }, "a : '1'")).toBe(false);
    expect(matches({ a: 1 }, 'a : true')).toBe(false);
    expect(matches({ a: 1 }, "a : '1'")).toBe(true);
  });

  it('coerces consistently for `in`, unlike the reference', () => {
    expect(matches({ a: 1 }, "a : '1'")).toBe(true);
    expect(matches({ a: 1 }, "a in ['1']")).toBe(true);
    expect(matches({ a: 1 }, "a not in ['1']")).toBe(false);
  });

  it('two numeric strings still compare numerically', () => {
    expect(matches({ a: '10' }, "a > '9'")).toBe(true);
    expect(matches({ a: 10 }, "a > '9'")).toBe(true);
    expect(stringify(parse('a > 9'))).toBe("a > '9'");
  });
});
