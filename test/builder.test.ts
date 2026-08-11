import { describe, it, expect } from 'vitest';
import { FilterBuilder } from '../src/builder.js';
import { FilterStringTransformer } from '../src/transformer.js';
import { FilterParserImpl } from '../src/parser.js';
import {
  FieldNode,
  InputNode,
  InfixOperationNode,
  PriorityNode,
  CollectionNode,
} from '../src/nodes.js';

const fb = new FilterBuilder();
const transformer = new FilterStringTransformer();
const parser = new FilterParserImpl();

function str(node: any): string {
  return transformer.transform(node.get());
}

describe('FilterBuilder', () => {
  it('simple field equals value', () => {
    const result = fb.field('name').equal(fb.input('john'));
    expect(str(result)).toBe("name : 'john'");
  });

  it('field greaterThan', () => {
    const result = fb.field('age').greaterThan(fb.input(18));
    expect(str(result)).toBe("age > '18'");
  });

  it('and chain', () => {
    const result = fb
      .field('age').greaterThan(fb.input(18))
      .and(fb.field('status').equal(fb.input('active')));
    expect(str(result)).toBe("age > '18' and status : 'active'");
  });

  it('or chain', () => {
    const result = fb
      .field('color').equal(fb.input('red'))
      .or(fb.field('color').equal(fb.input('blue')));
    expect(str(result)).toBe("color : 'red' or color : 'blue'");
  });

  it('fb.and() convenience', () => {
    const result = fb.and(
      fb.field('age').greaterThan(fb.input(18)),
      fb.field('status').equal(fb.input('active'))
    );
    expect(str(result)).toBe("age > '18' and status : 'active'");
  });

  it('fb.or() convenience', () => {
    const result = fb.or(
      fb.field('color').equal(fb.input('red')),
      fb.field('color').equal(fb.input('blue'))
    );
    expect(str(result)).toBe("color : 'red' or color : 'blue'");
  });

  it('isNull', () => {
    const result = fb.field('deletedAt').isNull();
    expect(str(result)).toBe('deletedAt is null');
  });

  it('isNotNull', () => {
    const result = fb.field('email').isNotNull();
    expect(str(result)).toBe('email is not null');
  });

  it('isEmpty', () => {
    const result = fb.field('tags').isEmpty();
    expect(str(result)).toBe('tags is empty');
  });

  it('between', () => {
    const result = fb.field('age').between(fb.input(18), fb.input(65));
    expect(str(result)).toBe("age between '18' and '65'");
  });

  it('collection in', () => {
    const result = fb.field('status').in(
      fb.collection(fb.input('active'), fb.input('pending'))
    );
    expect(str(result)).toBe("status in ['active', 'pending']");
  });

  it('not', () => {
    const result = fb.field('active').equal(fb.input(true)).not();
    expect(str(result)).toBe("not active : 'true'");
  });

  it('priority (parentheses)', () => {
    const result = fb.and(
      fb.priority(fb.or(
        fb.field('a').equal(fb.input(1)),
        fb.field('b').equal(fb.input(2))
      )),
      fb.field('c').equal(fb.input(3))
    );
    expect(str(result)).toBe("(a : '1' or b : '2') and c : '3'");
  });

  it('nested fields', () => {
    const result = fb.field('user.name').equal(fb.input('john'));
    expect(str(result)).toBe("user.name : 'john'");
  });

  it('xor', () => {
    const result = fb.field('a').equal(fb.input(true)).xor(fb.field('b').equal(fb.input(true)));
    expect(str(result)).toBe("a : 'true' xor b : 'true'");
  });

  it('startsWith', () => {
    const result = fb.field('name').startsWith('Jo');
    expect(str(result)).toBe("name ~ 'Jo%'");
  });

  it('endsWith', () => {
    const result = fb.field('email').endsWith('@gmail.com');
    expect(str(result)).toBe("email ~ '%@gmail.com'");
  });

  it('contains', () => {
    const result = fb.field('description').contains('keyword');
    expect(str(result)).toBe("description ~ '%keyword%'");
  });
});
