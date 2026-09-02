import { describe, it, expect } from 'vitest';
import {
  FilterParserImpl, FilterBuilder, FilterStringTransformer,
  FilterOperatorsImpl, getDefaultOperators,
  FunctionResolver, PlaceholderResolver,
  ParseContextImpl, InvalidSyntaxException,
  FilterPrefixOperator, FilterInfixOperator, FilterPostfixOperator,
  FilterFunction, FilterPlaceholder,
  BaseFilterNodeTransformer,
  FieldNode, InputNode, PriorityNode, CollectionNode, FunctionNode,
  PlaceholderNode, CollectionLikeNode,
  InfixOperationNode, PrefixOperationNode, PostfixOperationNode,
  EqualOperator, NotEqualOperator, AndOperator, OrOperator, XorOperator,
  NotOperator, LikeOperator, InsensitiveLikeOperator,
  InOperator, NotInOperator,
  GreaterThanOperator, GreaterThanOrEqualOperator,
  LessThanOperator, LessThanOrEqualOperator,
  IsNullOperator, IsNotNullOperator, IsEmptyOperator, IsNotEmptyOperator,
  SizeFunction, TodayFunction, HelloWorldPlaceholder,
  FieldResult, InputResult, ComparisonResult, LogicResult,
  CollectionResult, FunctionResult, PlaceholderResult, PriorityResult,
  FilterBuilder as FB,
} from '../src/index.js';

FunctionResolver.setResolver(n => n === 'size' ? new SizeFunction() : new TodayFunction());
PlaceholderResolver.setResolver(n => new HelloWorldPlaceholder());

const parser = new FilterParserImpl();
const transformer = new FilterStringTransformer();

function out(s: string) { return transformer.transform(parser.parse(s)); }

describe('comprehensive final audit', () => {
  describe('exports', () => {
    it('all node types exportable', () => {
      expect(FieldNode).toBeDefined();
      expect(InputNode).toBeDefined();
      expect(PriorityNode).toBeDefined();
      expect(CollectionNode).toBeDefined();
      expect(FunctionNode).toBeDefined();
      expect(PlaceholderNode).toBeDefined();
      expect(CollectionLikeNode).toBeDefined();
      expect(InfixOperationNode).toBeDefined();
      expect(PrefixOperationNode).toBeDefined();
      expect(PostfixOperationNode).toBeDefined();
    });

    it('all operator classes exportable', () => {
      expect(EqualOperator).toBeDefined();
      expect(NotEqualOperator).toBeDefined();
      expect(AndOperator).toBeDefined();
      expect(OrOperator).toBeDefined();
      expect(XorOperator).toBeDefined();
      expect(NotOperator).toBeDefined();
      expect(LikeOperator).toBeDefined();
      expect(InsensitiveLikeOperator).toBeDefined();
      expect(InOperator).toBeDefined();
      expect(NotInOperator).toBeDefined();
      expect(GreaterThanOperator).toBeDefined();
      expect(GreaterThanOrEqualOperator).toBeDefined();
      expect(LessThanOperator).toBeDefined();
      expect(LessThanOrEqualOperator).toBeDefined();
      expect(IsNullOperator).toBeDefined();
      expect(IsNotNullOperator).toBeDefined();
      expect(IsEmptyOperator).toBeDefined();
      expect(IsNotEmptyOperator).toBeDefined();
    });

    it('extension classes exportable', () => {
      expect(FilterPrefixOperator).toBeDefined();
      expect(FilterInfixOperator).toBeDefined();
      expect(FilterPostfixOperator).toBeDefined();
      expect(FilterFunction).toBeDefined();
      expect(FilterPlaceholder).toBeDefined();
      expect(FilterOperatorsImpl).toBeDefined();
      expect(getDefaultOperators).toBeDefined();
      expect(FunctionResolver).toBeDefined();
      expect(PlaceholderResolver).toBeDefined();
    });

    it('builder results exportable', () => {
      expect(FieldResult).toBeDefined();
      expect(InputResult).toBeDefined();
      expect(ComparisonResult).toBeDefined();
      expect(LogicResult).toBeDefined();
      expect(CollectionResult).toBeDefined();
      expect(FunctionResult).toBeDefined();
      expect(PlaceholderResult).toBeDefined();
      expect(PriorityResult).toBeDefined();
    });

    it('misc exportable', () => {
      expect(ParseContextImpl).toBeDefined();
      expect(InvalidSyntaxException).toBeDefined();
      expect(FilterStringTransformer).toBeDefined();
      expect(BaseFilterNodeTransformer).toBeDefined();
    });
  });

  describe('syntax coverage', () => {
    const syntax = [
      "a : '1'",
      "a ! '1'",
      "a = '1'",
      "a <> '1'",
      "a > '1'",
      "a < '1'",
      "a >: '1'",
      "a <: '1'",
      "a >= '1'",
      "a <= '1'",
      "a ~ 'x%'",
      "a ~~ 'x%'",
      "a like 'x%'",
      "a ilike 'x%'",
      "a is null",
      "a is not null",
      "a is empty",
      "a is not empty",
      "a in ['x', 'y']",
      "a not in ['x', 'y']",
      "a : '1' and b : '2'",
      "a : '1' or b : '2'",
      "a : '1' xor b : '2'",
      "not a : '1'",
      "a between '1' and '10'",
      "a between b and c",
      "(a : '1' or b : '2') and c : '3'",
      "[a, b] is empty",
      "size(x) > '0'",
      "x : `hello`",
      "a.b.c : 'deep'",
    ];

    for (const s of syntax) {
      it(`parses: ${s}`, () => {
        const node = parser.parse(s);
        const str = transformer.transform(node);
        const node2 = parser.parse(str);
        const str2 = transformer.transform(node2);
        expect(str2).toBe(str);
      });
    }
  });

  describe('builder coverage', () => {
    const fb = new FB();
    const t = (r: any) => transformer.transform(r.get());

    it('all comparisons', () => expect(t(fb.field('x').equal(fb.input(1)))).toBe("x : '1'"));
    it('notEqual', () => expect(t(fb.field('x').notEqual(fb.input(1)))).toBe("x ! '1'"));
    it('greaterThan', () => expect(t(fb.field('x').greaterThan(fb.input(1)))).toBe("x > '1'"));
    it('lessThan', () => expect(t(fb.field('x').lessThan(fb.input(1)))).toBe("x < '1'"));
    it('gte', () => expect(t(fb.field('x').greaterThanOrEqual(fb.input(1)))).toBe("x >: '1'"));
    it('lte', () => expect(t(fb.field('x').lessThanOrEqual(fb.input(1)))).toBe("x <: '1'"));
    it('like', () => expect(t(fb.field('x').like(fb.input('a%')))).toBe("x ~ 'a%'"));
    it('insensitiveLike', () => expect(t(fb.field('x').insensitiveLike(fb.input('a%')))).toBe("x ~~ 'a%'"));
    it('startsWith', () => expect(t(fb.field('x').startsWith('pre'))).toBe("x ~ 'pre%'"));
    it('endsWith', () => expect(t(fb.field('x').endsWith('suf'))).toBe("x ~ '%suf'"));
    it('contains', () => expect(t(fb.field('x').contains('mid'))).toBe("x ~ '%mid%'"));
    it('insensitiveStartsWith', () => expect(t(fb.field('x').insensitiveStartsWith('PRE'))).toBe("x ~~ 'PRE%'"));
    it('insensitiveEndsWith', () => expect(t(fb.field('x').insensitiveEndsWith('SUF'))).toBe("x ~~ '%SUF'"));
    it('insensitiveContains', () => expect(t(fb.field('x').insensitiveContains('MID'))).toBe("x ~~ '%MID%'"));
    it('in', () => expect(t(fb.field('x').in(fb.collection(fb.input('a'), fb.input('b'))))).toBe("x in ['a', 'b']"));
    it('notIn', () => expect(t(fb.field('x').notIn(fb.collection(fb.input('a'))))).toBe("x not in ['a']"));
    it('isNull', () => expect(t(fb.field('x').isNull())).toBe('x is null'));
    it('isNotNull', () => expect(t(fb.field('x').isNotNull())).toBe('x is not null'));
    it('isEmpty', () => expect(t(fb.field('x').isEmpty())).toBe('x is empty'));
    it('isNotEmpty', () => expect(t(fb.field('x').isNotEmpty())).toBe('x is not empty'));
    it('between', () => expect(t(fb.field('x').between(fb.input(1), fb.input(10)))).toBe("x between '1' and '10'"));
    it('likeCollection', () => expect(t(fb.field('x').likeCollection(fb.input('A%'), fb.input('B%')))).toBe("x ~ ['A%', 'B%']"));
    it('insensitiveLikeCollection', () => expect(t(fb.field('x').insensitiveLikeCollection(fb.input('a%')))).toBe("x ~~ ['a%']"));
    it('not', () => expect(t(fb.field('x').equal(fb.input(1)).not())).toBe("not x : '1'"));
    it('and + or chain', () => expect(t(
      fb.field('a').equal(fb.input(1)).and(fb.field('b').equal(fb.input(2))).or(fb.field('c').equal(fb.input(3)))
    )).toBe("a : '1' and b : '2' or c : '3'"));
    it('priority', () => expect(t(
      fb.priority(fb.field('a').equal(fb.input(1)))
    )).toBe("(a : '1')"));
    it('placeholder', () => expect(t(
      fb.placeholder(new HelloWorldPlaceholder()).equal(fb.input('val'))
    )).toBe("`hello` : 'val'"));
    it('function', () => expect(t(
      fb.function(new SizeFunction(), fb.field('col'))
    )).toBe('size(col)'));
    it('fb.and() multi', () => expect(t(
      fb.and(fb.field('a').equal(fb.input(1)), fb.field('b').equal(fb.input(2)))
    )).toBe("a : '1' and b : '2'"));
    it('fb.or() multi', () => expect(t(
      fb.or(fb.field('a').equal(fb.input(1)), fb.field('b').equal(fb.input(2)))
    )).toBe("a : '1' or b : '2'"));
    it('from wraps node', () => expect(t(
      fb.from(fb.field('x').equal(fb.input(1)).get())
    )).toBe("x : '1'"));
  });

  describe('custom operators', () => {
    it('custom infix can be added', () => {
      class MyOp extends FilterInfixOperator { constructor() { super('@@', 100); } }
      const ops = new FilterOperatorsImpl(
        [...getDefaultOperators().getPrefixOperators()],
        [...getDefaultOperators().getInfixOperators(), new MyOp()],
        [...getDefaultOperators().getPostfixOperators()],
      );
      const p = new FilterParserImpl(ops);
      const node = p.parse("a @@ '1'");
      const str = transformer.transform(node);
      expect(str).toBe("a @@ '1'");
      const str2 = transformer.transform(p.parse(str));
      expect(str2).toBe(str);
    });

    it('custom postfix can be added', () => {
      class MyOp extends FilterPostfixOperator { constructor() { super('is ready', 100); } }
      const ops = new FilterOperatorsImpl(
        [...getDefaultOperators().getPrefixOperators()],
        [...getDefaultOperators().getInfixOperators()],
        [...getDefaultOperators().getPostfixOperators(), new MyOp()],
      );
      const p = new FilterParserImpl(ops);
      const node = p.parse('task is ready');
      const str = transformer.transform(node);
      expect(str).toBe('task is ready');
    });

    it('custom prefix can be added', () => {
      class MyOp extends FilterPrefixOperator { constructor() { super('*', 75); } }
      const ops = new FilterOperatorsImpl(
        [...getDefaultOperators().getPrefixOperators(), new MyOp()],
        [...getDefaultOperators().getInfixOperators()],
        [...getDefaultOperators().getPostfixOperators()],
      );
      const p = new FilterParserImpl(ops);
      const node = p.parse("* a : '1'");
      const str = transformer.transform(node);
      expect(str).toBe("* a : '1'");
    });

    it('custom function works', () => {
      class MyFunc extends FilterFunction { constructor() { super('double'); } }
      FunctionResolver.setResolver(n => n === 'double' ? new MyFunc() : null as any);
      const node = parser.parse("double(x) > '5'");
      const str = transformer.transform(node);
      expect(str).toBe("double(x) > '5'");
    });

    it('custom placeholder works', () => {
      class MyPH extends FilterPlaceholder { constructor() { super('uid'); } }
      PlaceholderResolver.setResolver(n => n === 'uid' ? new MyPH() : null as any);
      const node = parser.parse("user : `uid`");
      const str = transformer.transform(node);
      expect(str).toBe("user : `uid`");
    });
  });

  describe('edge cases', () => {
    it('chained comparisons', () => expect(out("a > b > c")).toBe('a > b > c'));
    it('not not', () => expect(out("not not a : '1'")).toBe("not not a : '1'"));
    it('nested between', () => expect(out("a between b and c and d between e and f")).toBe('a between b and c and d between e and f'));
    it('not between', () => expect(out("not (a between '1' and '2')")).toBe("not (a between '1' and '2')"));
    it('collection postfix', () => expect(out('[x, y] is empty')).toBe('[x, y] is empty'));
    it('collection not empty', () => expect(out('c is not empty')).toBe('c is not empty'));
    it('negative number', () => expect(out("x : '-5'")).toBe("x : '-5'"));
    it('decimal', () => expect(out("x : '3.14'")).toBe("x : '3.14'"));
    it('xor chained with and', () => expect(out("a : '1' xor b : '2' and c : '3'")).toBe("a : '1' xor b : '2' and c : '3'"));
    it('deep nested parens', () => expect(out("not (a : '1' or (b : '2' and c : '3'))")).toBe("not (a : '1' or (b : '2' and c : '3'))"));
    it('between with parens', () => expect(out("a between ('1') and ('2')")).toBe("a between ('1') and ('2')"));
    it('collection in expression', () => expect(out("a in ['x', 'y', 'z']")).toBe("a in ['x', 'y', 'z']"));
    it('empty collection', () => expect(out("a in []")).toBe('a in []'));
  });
});
