# FilterKit

Filter expression language for JavaScript and TypeScript. Filter arrays in-memory, or build filter queries to send to [Spring Filter](https://github.com/turkraft/springfilter) backends.

```ts
import { f, filter, build, stringify } from '@turkraft/filterkit';

// Filter an array with a template literal
const adults = filter(users, f`age > ${18} and status in ${['active', 'pending']}`);

// Or build a query for your Spring Boot API
const query = build()
  .field('year').between(2020, 2025)
  .and(build().field('brand.name').in(['audi', 'bmw']))
  .get();

fetch(`/api/cars?filter=${encodeURIComponent(stringify(query))}`);
```

## Install

```bash
npm install @turkraft/filterkit
```

## Ecosystem

| Package | Description |
|---|---|
| [FilterKit TanStack](https://github.com/turkraft/filterkit-tanstack) | TanStack Table column filters → filter expressions |
| [FilterKit QueryBuilder](https://github.com/turkraft/filterkit-querybuilder) | react-querybuilder queries → filter expressions |
| [FilterKit Prisma](https://github.com/turkraft/filterkit-prisma) | Filter expressions → Prisma where clauses |
| [FilterKit Drizzle](https://github.com/turkraft/filterkit-drizzle) | Filter expressions → Drizzle where clauses |

## [Sponsors](https://github.com/sponsors/torshid)

Sponsor our project and have your issues prioritized.

<table>
<tr>
<td align="center"><a href="https://github.com/ixorbv"><img width="64" src="https://avatars.githubusercontent.com/u/127401397?v=4"/><br/>ixorbv</a></td>
<td align="center"><a href="https://github.com/marcopag90"><img width="64" src="https://avatars.githubusercontent.com/marcopag90"/><br/>marcopag90</a></td>
</tr>
</table>

## Usage

### Filtering arrays

`filter` and `matches` accept either an expression string or a parsed `FilterNode`.

```ts
import { f, filter, matches } from '@turkraft/filterkit';

const data = [
  { name: 'John', age: 30, active: true },
  { name: 'Jane', age: 25, active: false },
];

filter(data, 'age > 28');          // => [{ name: 'John', ... }]
filter(data, f`age > ${28}`);      // same, with a JS value interpolated
matches(data[0], f`active : ${true}`);  // => true
```

### Template literals

Use the `f` tagged template to build expressions with JavaScript values. Strings are quoted and escaped automatically. Arrays become collections. `FilterNode` values can be composed.

```ts
const minAge = 18;
const statuses = ['active', 'pending'];

const expr = f`age > ${minAge} and status in ${statuses}`;

filter(data, expr);
stringify(expr);
// => "age > '18' and status in ['active', 'pending']"
```

`Date` values are interpolated as ISO-8601, so they survive a round trip through a
string and are unambiguous on the wire:

```ts
stringify(f`createdAt > ${new Date('2024-03-05T10:20:30Z')}`);
// => "createdAt > '2024-03-05T10:20:30.000Z'"
```

Interpolation is the only safe way to put user input into an expression — a value
containing `'` is escaped rather than closing the literal.

### Building queries for an API

```ts
import { build, stringify } from '@turkraft/filterkit';

const node = build()
  .field('year').greaterThan(2020)
  .and(build().field('category').isNull())
  .get();

stringify(node);
// => year > '2020' and category is null
```

Complex queries. `stringify` adds parentheses wherever they are needed to preserve
the grouping you built:

```ts
build().field('brand.name').in(['audi', 'bmw'])
  .and(build().field('year').greaterThan(2020)
    .or(build().field('km').lessThan(50000)))
  .get();

// => brand.name in ['audi', 'bmw'] and (year > '2020' or km < '50000')
```

With functions:

```ts
import { SizeFunction } from '@turkraft/filterkit';

build().function(new SizeFunction(), build().field('accidents'))
  .greaterThan(2)
  .and(build().field('year').lessThan(2015))
  .get();
```

### Parsing and stringifying

```ts
import { parse, stringify } from '@turkraft/filterkit';

const ast = parse("a > '18' and b : 'c'");
stringify(ast);  // AST back to canonical string
```

`stringify` quotes every value: `age > 5` becomes `age > '5'`. A server that
knows the field's type converts it back, so this is what you want on the wire. It
does mean the value's JavaScript type is lost — if you are feeding an ORM adapter,
pass it the `FilterNode` rather than a stringified expression.

Parse errors are `InvalidSyntaxException` and carry the offending position:

```ts
import { InvalidSyntaxException } from '@turkraft/filterkit';

try {
  parse('a : : b');
} catch (e) {
  if (e instanceof InvalidSyntaxException) {
    e.input;            // "a : : b"
    e.position;         // 4
    e.offendingSymbol;  // ":"
  }
}
```

## Operators

```
a and b              // logical and
a or b               // logical or
a xor b              // logical xor
not a                // logical not
a : b                // equals
a = b                // equals (alias)
a ! b                // not equals
a <> b               // not equals (alias)
a > b                // greater than
a >: b               // greater than or equal
a >= b               // greater than or equal (alias)
a < b                // less than
a <: b               // less than or equal
a <= b               // less than or equal (alias)
a between x and y    // between (inclusive range)
a ~ 'pattern'        // like (% and _ wildcards)
a like 'pattern'     // like (alias)
a ~~ 'pattern'       // case-insensitive like
a ilike 'pattern'    // case-insensitive like (alias)
a in [x, y]          // in collection
a not in [x, y]      // not in collection
a is null            // null check
a is not null        // not null check
a is empty           // empty check (collections/strings)
a is not empty       // not empty check
```

Operator tokens are case-insensitive (`IS NULL`, `LiKe`). Multi-word operators
(`is null`, `is not null`, `is empty`, `is not empty`, `not in`) must be written
with exactly one space between the words.

### Precedence

From loosest to tightest: `or`/`xor` (25), `and` (50), `not` (75), everything else
(100). Use parentheses to override:

```
a and (b or c)
(status : 'active' or status : 'pending') and year > '2020'
```

### Wildcards in `like`

`%` matches any run of characters and `_` matches one. The in-memory engine also
reads `\%` and `\_` as literal wildcards.

If you interpolate user input into a pattern — `contains('...')`, `startsWith('...')`,
or `%${value}%` — a `%` the user typed becomes a wildcard. Strip or reject those
characters yourself if that matters, and note that a server may not honour `\%`
as an escape.

## Expression Examples

### Basic filtering

```
status : 'active'
year > 2020 and km < 50000
year between 2020 and 2025
color : 'red' or color : 'blue'
```

### Nested fields

```
brand.name : 'audi'
brand.manufacturer.country : 'germany'
brand is not null
```

### Collections and functions

```
status in ['active', 'pending']
size(accidents) > 2
accidents is empty
ratings is not empty
```

### Pattern matching

```
name ~ '%john%'
name ~~ 'JOHN'
email ~ 'admin%'
filename ~ '%.pdf'
name ~ ['%john%', '%doe%']    // matches if any pattern matches
```

### Boolean logic

```
(year > 2020 and km < 30000) or (year > 2018 and km < 10000)
brand.name in ['audi', 'bmw'] and year > 2020 and accidents is empty and color ! 'white'
```

## In-memory evaluation

`filter`, `matches` and `createPredicate` take an options object supplying
placeholder values and custom function implementations:

```ts
import { FilterPlaceholder, PlaceholderResolver, matches } from '@turkraft/filterkit';

// 1. make `me` parseable
class CurrentUser extends FilterPlaceholder { constructor() { super('me'); } }
PlaceholderResolver.setResolver(name => name === 'me' ? new CurrentUser() : null);

// 2. give it a value at evaluation time
matches(row, 'owner : `me`', { placeholders: { me: currentUser.id } });
```

Custom functions work the same way — register the definition once so it parses
(see [Custom functions and placeholders](#custom-functions-and-placeholders)),
then pass an implementation:

```ts
matches(row, 'len(name) > 3', {
  functions: { len: ([value]) => String(value).length },
});
```

Built-in functions: `size(x)` (string length, array/Set/Map size, or object key
count) and `today()`.

`today()` returns today's date at local midnight, so `createdAt > today()` compares
as you would expect.

Comparison follows SQL-ish rules: `null` on either side of an ordering comparison
is never true, numbers and numeric strings compare numerically, `Date` values
compare against ISO-8601 strings and epoch numbers by instant, booleans compare
against `'true'` / `'false'` / `'yes'` / `'no'` / `'on'` / `'off'`, and everything
else compares by code point, so results never depend on the machine's locale.

Booleans need one caveat. `stringify` renders a boolean as the text `'true'`, and
equality and truthiness read it back, so `active : true` and `not active` behave
the same before and after a round trip through a string. Ordering does not:
`a < true` finds no ordering between a number and a boolean. Use `:` for booleans.

## Custom operators

Define custom operators by extending `FilterInfixOperator`, `FilterPrefixOperator`, or `FilterPostfixOperator`:

```ts
import { FilterInfixOperator, FilterOperatorsImpl, getDefaultOperators, FilterParserImpl } from '@turkraft/filterkit';

class ContainsOperator extends FilterInfixOperator {
  constructor() { super('contains', 100); }
}

const ops = new FilterOperatorsImpl(
  getDefaultOperators().getPrefixOperators(),
  [...getDefaultOperators().getInfixOperators(), new ContainsOperator()],
  getDefaultOperators().getPostfixOperators(),
);

const parser = new FilterParserImpl(ops);
parser.parse("name contains 'hello'");
```

A custom operator set belongs to the parser (and to `new FilterBuilder(ops)`) that
you create with it. The top-level `parse`, `filter`, `matches`, `expr`, `f` and
`build` helpers use the default operator set and will not recognise it. The
in-memory predicate engine only knows how to evaluate the built-in operators, so a
custom operator can be parsed, built and stringified but not evaluated by
`filter`/`matches`.

## Custom functions and placeholders

```ts
import { FilterFunction, FilterPlaceholder, FunctionResolver, PlaceholderResolver } from '@turkraft/filterkit';

class LengthFunction extends FilterFunction { constructor() { super('len'); } }
class CurrentUser extends FilterPlaceholder { constructor() { super('me'); } }

FunctionResolver.setResolver(name => name === 'len' ? new LengthFunction() : null);
PlaceholderResolver.setResolver(name => name === 'me' ? new CurrentUser() : null);
```

Return `null` for names you do not handle; the built-in `size`, `today` and `hello`
definitions remain available. Both resolvers are process-wide singletons, so a
second `setResolver` call replaces the first — register everything you need in one
resolver.

Registering a definition makes an expression *parse*. To also *evaluate* it in
memory, pass an implementation through the `functions` / `placeholders` options
shown above.

## Field and node mapping

```ts
import { ParseContextImpl, parse } from '@turkraft/filterkit';

const ctx = new ParseContextImpl(
  (field) => field === 'dbName' ? 'clientName' : field,
  (node) => node,
);

parse("dbName : 'john'", ctx);
```

The field mapper is applied to each dot-separated segment. The node mapper is
called exactly once per node, bottom-up, as the tree is built.

## Limits

`parse` raises a catchable `InvalidSyntaxException` once an expression nests
deeper than `maxDepth` (500 by default), rather than overflowing the stack, so it
is safe to hand it untrusted input:

```ts
new FilterParserImpl(undefined, { maxDepth: 100 });
```

## Using a Spring Filter backend

FilterKit's syntax, operator precedence and AST match
[Spring Filter](https://github.com/turkraft/springfilter), so expressions built
here can be sent straight to a Spring Boot API. You can skip this section
entirely if your backend is something else.

The default parser is slightly more permissive than Spring Filter's grammar.
Pass `strict: true` to accept only what a Spring Filter backend accepts, so an
expression that parses on the client is guaranteed to parse on the server:

```ts
const parser = new FilterParserImpl(undefined, { strict: true });
```

| Input | Spring Filter | default | `strict: true` |
|---|---|---|---|
| `in : 1`, `and : 1` (operator used as a field name) | rejected | accepted | rejected |
| `a : 'it''s'` (doubled-quote escape) | rejected | accepted | rejected |
| `a : 'a
b'` (escape other than `'` and `\`) | rejected | accepted | rejected |
| a line break used as whitespace | rejected | accepted | rejected |
| `a Between 1 and 5` (mixed-case keyword) | rejected | accepted | rejected |
| `a : True` (mixed-case literal) | field named `True` | boolean `true` | field named `True` |

Everything else — operator tokens, priorities, associativity, `between` expansion
and `like` against a collection of patterns — matches. `test/spring-filter-parity.test.ts`
checks strict mode against 2,026 expressions whose verdicts came from Spring
Filter's own lexer and parser.

The in-memory `filter` / `matches` engine is a close but not exact match for
Spring Filter's own in-memory engine (they agree on 98.3% of a 11,000-expression
corpus). It differs where FilterKit is deliberately more consistent: `a in ['1']`
matches a numeric `1` here, and two numeric strings compare numerically. This only
affects local evaluation, never what you send to the server.

## License

MIT
