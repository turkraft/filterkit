import { describe, it, expect } from 'vitest';
import { FilterParserImpl, InvalidSyntaxException } from '../src/index.js';
import verdicts from './fixtures/spring-filter-verdicts.json';
import { FieldNode, InputNode, InfixOperationNode } from '../src/nodes.js';

const strict = new FilterParserImpl(undefined, { strict: true });
const lenient = new FilterParserImpl();

type Accepted = 'accepted' | 'rejected';

function run(parser: FilterParserImpl, input: string): Accepted {
  try {
    parser.parse(input);
    return 'accepted';
  } catch {
    return 'rejected';
  }
}

const CASES: Array<{ name: string; input: string; java: Accepted; lenient: Accepted }> = [
  { name: 'field named `in`', input: 'in : 1', java: 'rejected', lenient: 'accepted' },
  { name: 'field named `and`', input: 'and : 1', java: 'rejected', lenient: 'accepted' },
  { name: 'field named `not`', input: 'not : 1', java: 'rejected', lenient: 'rejected' },
  { name: 'field named `is`', input: 'is : 1', java: 'accepted', lenient: 'accepted' },
  { name: 'nested field named `in`', input: 'a.in : 1', java: 'rejected', lenient: 'accepted' },
  { name: 'field merely starting with an operator', input: 'notes : 1', java: 'accepted', lenient: 'accepted' },
  { name: 'field merely starting with an operator', input: 'index : 1', java: 'accepted', lenient: 'accepted' },

  { name: 'unterminated string', input: "a : 'unterminated", java: 'rejected', lenient: 'rejected' },
  { name: "doubled '' escape", input: "a : 'it''s'", java: 'rejected', lenient: 'accepted' },
  { name: "backslash ' escape", input: "a : 'it\\'s'", java: 'accepted', lenient: 'accepted' },
  { name: 'backslash escape of anything else', input: "a : 'a\\nb'", java: 'rejected', lenient: 'accepted' },

  { name: 'newline as whitespace', input: 'a : 1\nand b : 2', java: 'rejected', lenient: 'accepted' },
  { name: 'carriage return as whitespace', input: 'a : 1\rand b : 2', java: 'rejected', lenient: 'accepted' },
  { name: 'tab as whitespace', input: 'a : 1\tand b : 2', java: 'accepted', lenient: 'accepted' },

  { name: 'is null', input: 'a is null', java: 'accepted', lenient: 'accepted' },
  { name: 'is  null (two spaces)', input: 'a is  null', java: 'rejected', lenient: 'rejected' },
  { name: 'is\\tnot\\tnull', input: 'a is\tnot\tnull', java: 'rejected', lenient: 'rejected' },
  { name: 'not  in (two spaces)', input: 'a not  in [1]', java: 'rejected', lenient: 'rejected' },

  { name: 'between (lower)', input: 'a between 1 and 5', java: 'accepted', lenient: 'accepted' },
  { name: 'BETWEEN (upper)', input: 'a BETWEEN 1 and 5', java: 'accepted', lenient: 'accepted' },
  { name: 'Between (mixed)', input: 'a Between 1 and 5', java: 'rejected', lenient: 'accepted' },
  { name: 'IS NULL (upper)', input: 'a IS NULL', java: 'accepted', lenient: 'accepted' },
  { name: 'LiKe (mixed)', input: "a LiKe 'x'", java: 'accepted', lenient: 'accepted' },

  { name: 'scientific notation', input: 'a : 1e5', java: 'rejected', lenient: 'rejected' },
  { name: 'negative number without spaces', input: 'a>-5', java: 'accepted', lenient: 'accepted' },
  { name: 'decimal', input: 'a : 1.5', java: 'accepted', lenient: 'accepted' },

  { name: 'empty input', input: '', java: 'rejected', lenient: 'rejected' },
  { name: 'like against a collection', input: "name ~ ['%a%','%b%']", java: 'accepted', lenient: 'accepted' },
  { name: 'in without brackets', input: 'a in 1', java: 'accepted', lenient: 'accepted' },
  { name: 'unbalanced parenthesis', input: '(a : 1', java: 'rejected', lenient: 'rejected' },
];

describe('strict mode agrees with the Spring Filter grammar', () => {
  for (const c of CASES) {
    it(`${c.name}: \`${c.input.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}\``, () => {
      expect(run(strict, c.input)).toBe(c.java);
    });
  }
});

describe('the default parser stays lenient', () => {
  for (const c of CASES) {
    it(`${c.name}: \`${c.input.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}\``, () => {
      expect(run(lenient, c.input)).toBe(c.lenient);
    });
  }

  it('never rejects something the Java grammar accepts', () => {
    for (const c of CASES) {
      if (c.java === 'accepted') expect(c.lenient).toBe('accepted');
    }
  });
});

describe('boolean literal casing', () => {
  it('lenient mode treats any casing as a boolean', () => {
    expect(((lenient.parse('a : True') as InfixOperationNode).getRight() as InputNode).getValue()).toBe(true);
  });

  it('strict mode treats `True` as a field name, as the grammar does', () => {
    const right = (strict.parse('a : True') as InfixOperationNode).getRight();
    expect(right).toBeInstanceOf(FieldNode);
    expect((right as FieldNode).getName()).toBe('True');
  });

  it('strict mode still reads `true` and `TRUE` as booleans', () => {
    for (const literal of ['true', 'TRUE']) {
      const right = (strict.parse(`a : ${literal}`) as InfixOperationNode).getRight();
      expect(right).toBeInstanceOf(InputNode);
      expect((right as InputNode).getValue()).toBe(true);
    }
  });
});

describe('strict mode error reporting', () => {
  it('explains a line break', () => {
    expect(() => strict.parse('a : 1\nand b : 2')).toThrow(InvalidSyntaxException);
    expect(() => strict.parse('a : 1\nand b : 2')).toThrow(/Line breaks/);
  });

  it('explains an unsupported escape', () => {
    expect(() => strict.parse("a : 'a\\nb'")).toThrow(/Invalid escape sequence/);
  });
});

describe('differential parity against the Java reference', () => {
  const cases = verdicts as Array<[string, boolean]>;

  it('strict mode reproduces every reference verdict', () => {
    const strictAcceptsJavaRejects: string[] = [];
    const javaAcceptsStrictRejects: string[] = [];

    for (const [input, javaAccepts] of cases) {
      const strictAccepts = run(strict, input) === 'accepted';
      if (strictAccepts === javaAccepts) continue;
      (strictAccepts ? strictAcceptsJavaRejects : javaAcceptsStrictRejects)
        .push(JSON.stringify(input));
    }

    expect(strictAcceptsJavaRejects.slice(0, 10)).toEqual([]);
    expect(javaAcceptsStrictRejects.slice(0, 10)).toEqual([]);
  });

  it('the lenient parser accepts everything the reference accepts', () => {
    const regressions = cases
      .filter(([, javaAccepts]) => javaAccepts)
      .filter(([input]) => run(lenient, input) !== 'accepted')
      .map(([input]) => JSON.stringify(input));
    expect(regressions.slice(0, 10)).toEqual([]);
  });

  it('covers a meaningful corpus', () => {
    expect(cases.length).toBeGreaterThan(2000);
    expect(cases.filter(([, accepted]) => accepted).length).toBeGreaterThan(1000);
  });
});
