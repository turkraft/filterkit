import { FilterParserImpl, FunctionResolver, PlaceholderResolver } from './parser.js';
import { FilterStringTransformer } from './transformer.js';
import { FilterBuilder } from './builder.js';
import { getDefaultOperators, SizeFunction, TodayFunction, HelloWorldPlaceholder } from './operators.js';
import { createPredicate, filter as filterWithNode } from './predicate.js';
import { FilterNode } from './nodes.js';
import type { FilterFunction, FilterPlaceholder } from './nodes.js';

const defaultParser = new FilterParserImpl();
const defaultTransformer = new FilterStringTransformer();
const defaultBuilder = new FilterBuilder();

FunctionResolver.setResolver((name) => {
  if (name === 'size') return new SizeFunction();
  if (name === 'today') return new TodayFunction();
  throw new Error(`Unrecognized function \`${name}\``);
});

PlaceholderResolver.setResolver((name) => {
  if (name === 'hello') return new HelloWorldPlaceholder();
  throw new Error(`Unrecognized placeholder \`${name}\``);
});

export function parse(input: string): FilterNode {
  return defaultParser.parse(input);
}

export function stringify(node: FilterNode): string {
  return defaultTransformer.transform(node);
}

export function build(): FilterBuilder {
  return defaultBuilder;
}

export function filter<T>(data: T[], expression: string): T[] {
  const node = defaultParser.parse(expression);
  return filterWithNode(data, node);
}

export function matches<T>(obj: T, expression: string): boolean {
  const node = defaultParser.parse(expression);
  const pred = createPredicate(node);
  return pred(obj);
}

export function expr(input: string): FilterNode {
  return defaultParser.parse(input);
}

export { createPredicate };
export { FilterBuilder } from './builder.js';
export { FilterParserImpl } from './parser.js';
export { FilterOperatorsImpl, getDefaultOperators } from './operators.js';
export { FunctionResolver, PlaceholderResolver, ParseContextImpl } from './parser.js';
