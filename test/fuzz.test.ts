import { describe, it, expect } from 'vitest';
import { parse, stringify, matches, InvalidSyntaxException, FilterParserImpl } from '../src/index.js';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const ALPHABET = [
  ...`abcdefgxyz`, ...`0123456789`, ' ', ' ', ' ', '.', ',', '(', ')', '[', ']',
  "'", '`', ':', '=', '!', '<', '>', '~', '-', '_', '$', '\\', '\n', '\t', '%',
  '"', ';', '@', '#', '&', '|', '{', '}', '/', '*', '+', '?', '^',
];
const WORDS = [
  'and', 'or', 'xor', 'not', 'in', 'is', 'null', 'empty', 'between', 'like',
  'ilike', 'true', 'false', 'size', 'today', 'hello', 'not in', 'is null',
  'is not null', 'is empty', 'is not empty',
];

function randomInput(rand: () => number): string {
  const len = 1 + Math.floor(rand() * 60);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += rand() < 0.25
      ? WORDS[Math.floor(rand() * WORDS.length)] + ' '
      : ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}

function classify(fn: () => unknown): 'ok' | 'rejected' | string {
  try { fn(); return 'ok'; } catch (e: any) {
    if (e instanceof InvalidSyntaxException) return 'rejected';
    if (e instanceof Error && /^Unrecognized (function|placeholder)/.test(e.message)) return 'rejected';
    return `${e?.constructor?.name}: ${String(e?.message).slice(0, 60)}`;
  }
}

describe('parser fuzzing', () => {
  const SAMPLES = 20000;

  it('random input only ever yields InvalidSyntaxException', () => {
    const rand = rng(0x5EED);
    const bad: string[] = [];
    let ok = 0, rejected = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const input = randomInput(rand);
      const result = classify(() => parse(input));
      if (result === 'ok') ok++;
      else if (result === 'rejected') rejected++;
      else if (bad.length < 10) bad.push(`  ${JSON.stringify(input)}\n      ${result}`);
    }
    console.log(`  ${SAMPLES} inputs: ${ok} parsed, ${rejected} rejected cleanly, ${bad.length} unexpected`);
    bad.forEach(b => console.log(b));
    expect(bad).toEqual([]);
  }, 60000);

  it('anything that parses also stringifies and re-parses', () => {
    const rand = rng(0xFEED);
    const bad: string[] = [];
    let round = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const input = randomInput(rand);
      let node;
      try { node = parse(input); } catch { continue; }
      let s: string;
      try { s = stringify(node); } catch (e: any) {
        bad.push(`  stringify failed for ${JSON.stringify(input)}: ${e.message.slice(0, 60)}`);
        continue;
      }
      round++;
      const again = classify(() => {
        const re = stringify(parse(s));
        if (re !== s) throw new Error(`unstable:\n      ${s}\n      ${re}`);
      });
      if (again !== 'ok' && bad.length < 10) bad.push(`  ${JSON.stringify(input)}\n      ${again}`);
    }
    console.log(`  ${round} parseable inputs round-tripped, ${bad.length} problem(s)`);
    bad.forEach(b => console.log(b));
    expect(bad).toEqual([]);
  }, 60000);

  it('pathological shapes are rejected, not fatal', () => {
    const cases: Array<[string, string]> = [
      ['deep parens', '('.repeat(20000) + 'a' + ')'.repeat(20000)],
      ['deep not', 'not '.repeat(20000) + 'a'],
      ['deep brackets', '['.repeat(20000) + ']'.repeat(20000)],
      ['unclosed string', "a : '" + 'x'.repeat(100000)],
      ['many dots', 'a' + '.b'.repeat(50000)],
      ['long identifier', 'a'.repeat(200000)],
      ['many commas', '[' + '1,'.repeat(50000) + '1]'],
      ['only operators', ':='.repeat(20000)],
      ['nul character', 'a : \0'],
      ['lone surrogate', 'a : \uD800'],
    ];
    for (const [name, input] of cases) {
      const started = performance.now();
      const result = classify(() => parse(input));
      const ms = performance.now() - started;
      console.log(`  ${name.padEnd(18)} ${result === 'ok' ? 'parsed' : result === 'rejected' ? 'rejected' : result}  (${ms.toFixed(0)} ms)`);
      expect(result === 'ok' || result === 'rejected', `${name}: ${result}`).toBe(true);
      expect(ms, `${name} took ${ms}ms`).toBeLessThan(5000);
    }
  }, 60000);

  it('a custom maxDepth is honoured', () => {
    const shallow = new FilterParserImpl(undefined, { maxDepth: 5 });
    expect(() => shallow.parse('(a)')).not.toThrow();
    expect(() => shallow.parse('((((a))))')).not.toThrow();
    expect(() => shallow.parse('(((((a)))))')).toThrow(InvalidSyntaxException);
    expect(() => shallow.parse('not not not not a')).not.toThrow();
    expect(() => shallow.parse('not not not not not a')).toThrow(InvalidSyntaxException);
  });

  it('a long left-associative chain does not consume depth', () => {
    const shallow = new FilterParserImpl(undefined, { maxDepth: 5 });
    const chain = Array.from({ length: 500 }, (_, i) => `a : ${i}`).join(' and ');
    expect(() => shallow.parse(chain)).not.toThrow();
  });

  it('strict mode fails the same way, and never accepts more than lenient', () => {
    const strict = new FilterParserImpl(undefined, { strict: true });
    const lenient = new FilterParserImpl();
    const rand = rng(0x57121C);
    const bad: string[] = [];
    let strictOk = 0, lenientOk = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const input = randomInput(rand);
      const s = classify(() => strict.parse(input));
      const l = classify(() => lenient.parse(input));
      if (s === 'ok') strictOk++;
      if (l === 'ok') lenientOk++;
      if (s !== 'ok' && s !== 'rejected' && bad.length < 10) bad.push(`  strict ${JSON.stringify(input)}
      ${s}`);
      if (s === 'ok' && l !== 'ok' && bad.length < 10) {
        bad.push(`  strict accepted but lenient rejected: ${JSON.stringify(input)}`);
      }
    }
    console.log(`  strict parsed ${strictOk}, lenient parsed ${lenientOk}, ${bad.length} problem(s)`);
    bad.forEach(b => console.log(b));
    expect(bad).toEqual([]);
    expect(strictOk).toBeLessThanOrEqual(lenientOk);
  }, 60000);

  it('evaluation of fuzzed expressions never throws an unexpected error', () => {
    const rand = rng(0xC0DE);
    const bad: string[] = [];
    const rows = [{}, { a: 1 }, { a: 'x' }, { a: null }, { a: [1] }, { b: { c: 2 } }];
    for (let i = 0; i < 5000; i++) {
      const input = randomInput(rand);
      let node;
      try { node = parse(input); } catch { continue; }
      for (const row of rows) {
        try { matches(row, node); } catch (e: any) {
          if (/^(Unsupported|Placeholder)/.test(e.message)) continue;
          if (bad.length < 10) bad.push(`  ${JSON.stringify(input)} on ${JSON.stringify(row)}: ${e.constructor.name}: ${e.message.slice(0, 60)}`);
        }
      }
    }
    console.log(`  evaluation: ${bad.length} unexpected error(s)`);
    bad.forEach(b => console.log(b));
    expect(bad).toEqual([]);
  });
});
