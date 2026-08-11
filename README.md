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

FilterKit and Spring Filter share the exact same expression syntax, operator precedence, and AST.

## Install

```bash
npm install @turkraft/filterkit
```

## Ecosystem

| Package | Description |
|---|---|
| [FilterKit TanStack](https://github.com/turkraft/filterkit-tanstack) | TanStack Table column filters → Spring Filter |
| [FilterKit QueryBuilder](https://github.com/turkraft/filterkit-querybuilder) | react-querybuilder queries → Spring Filter |
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

```ts
import { f, filter, matches } from '@turkraft/filterkit';

const data = [
  { name: 'John', age: 30, active: true },
  { name: 'Jane', age: 25, active: false },
];

filter(data, f`age > ${28}`);
matches(data[0], f`active : ${true}`);
```

### Template literals

Use the `f` tagged template to build expressions with JavaScript values. Strings are quoted and escaped automatically. Arrays become collections. FilterNode values can be composed.

```ts
const minAge = 18;
const statuses = ['active', 'pending'];

const expr = f`age > ${minAge} and status in ${statuses}`;

filter(data, expr);
stringify(expr);
// => "age > '18' and status in ['active', 'pending']"
```

### Building queries for Spring Filter

```ts
import { build, stringify } from '@turkraft/filterkit';

const node = build()
  .field('year').greaterThan(2020)
  .and(build().field('category').isNull())
  .get();

stringify(node);
// => year > '2020' and category is null
```

Complex queries:

```ts
build().field('brand.name').in(['audi', 'bmw'])
  .and(build().field('year').greaterThan(2020)
    .or(build().field('km').lessThan(50000)))
  .get();
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

All operators are case-insensitive.

### Precedence

Use parentheses to control evaluation order:

```
a and (b or c)
(status : 'active' or status : 'pending') and year > '2020'
```

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
name ~ ['%john%', '%doe%']
```

### Boolean logic

```
(year > 2020 and km < 30000) or (year > 2018 and km < 10000)
brand.name in ['audi', 'bmw'] and year > 2020 and accidents is empty and color ! 'white'
```

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

Custom operators work in all APIs — parse, build, filter, and stringify.

## Custom functions and placeholders

```ts
import { FilterFunction, FilterPlaceholder, FunctionResolver, PlaceholderResolver } from '@turkraft/filterkit';

class LengthFunction extends FilterFunction { constructor() { super('len'); } }
class CurrentUser extends FilterPlaceholder { constructor() { super('me'); } }

FunctionResolver.setResolver(name => name === 'len' ? new LengthFunction() : null);
PlaceholderResolver.setResolver(name => name === 'me' ? new CurrentUser() : null);
```

## Field and node mapping

```ts
import { ParseContextImpl } from '@turkraft/filterkit';

const ctx = new ParseContextImpl(
  (field) => field === 'dbName' ? 'clientName' : field,
  (node) => node,
);

parse("dbName : 'john'", ctx);
```

## License

MIT
