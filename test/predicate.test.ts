import { describe, it, expect } from 'vitest';
import { parse, filter, matches, createPredicate } from '../src/filterkit.js';

const users = [
  { name: 'John', age: 30, active: true, tags: ['admin', 'dev'] },
  { name: 'Jane', age: 25, active: false, tags: [] },
  { name: 'Bob', age: 40, active: true, tags: ['dev'] },
  { name: 'Alice', age: 35, active: false, tags: ['qa'] },
];

describe('filterkit simple API', () => {
  it('parse returns AST', () => {
    const node = parse("age > 18");
    expect(node).toBeDefined();
  });

  it('filter by field', () => {
    const r = filter(users, "age > 28");
    expect(r).toHaveLength(3);
    expect(r.map(u => u.name)).toEqual(['John', 'Bob', 'Alice']);
  });

  it('filter with equality', () => {
    const r = filter(users, "active : true");
    expect(r).toHaveLength(2);
    expect(r.map(u => u.name)).toEqual(['John', 'Bob']);
  });

  it('filter with AND', () => {
    const r = filter(users, "age > 28 and active : true");
    expect(r).toHaveLength(2);
  });

  it('filter with OR', () => {
    const r = filter(users, "age < 28 or active : false");
    expect(r).toHaveLength(2);
  });

  it('filter with NOT', () => {
    const r = filter(users, "not active : true");
    expect(r).toHaveLength(2);
  });

  it('filter with IS NULL', () => {
    const r = filter(users, "name is not null");
    expect(r).toHaveLength(4);
  });

  it('filter with IS EMPTY', () => {
    const r = filter(users, "tags is empty");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Jane');
  });

  it('filter with IS NOT EMPTY', () => {
    const r = filter(users, "tags is not empty");
    expect(r).toHaveLength(3);
  });

  it('filter with IN', () => {
    const r = filter(users, "name in ['John', 'Bob']");
    expect(r).toHaveLength(2);
  });

  it('filter with LIKE', () => {
    const r = filter(users, "name ~ 'J%'");
    expect(r).toHaveLength(2);
  });

  it('matches single object', () => {
    expect(matches(users[0], "age > 28")).toBe(true);
    expect(matches(users[1], "age > 28")).toBe(false);
  });

  it('filter with BETWEEN', () => {
    const r = filter(users, "age between 28 and 40");
    expect(r).toHaveLength(3);
  });

  it('filter with BETWEEN inclusive', () => {
    const r = filter(users, "age between 30 and 35");
    expect(r).toHaveLength(2);
  });

  it('filter empty expression returns all', () => {
    const node = parse("age > 18");
    const pred = createPredicate(node);
    const r = users.filter(pred);
    expect(r).toHaveLength(4);
  });

  it('filter with numbers', () => {
    const r = filter(users, "age <: 30");
    expect(r).toHaveLength(2);
  });

  it('filter with XOR', () => {
    const r = filter(users, "active : true xor name : 'Bob'");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('John');
  });
});
