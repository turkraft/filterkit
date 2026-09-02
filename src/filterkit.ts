import { FilterParserImpl, type ParseContext } from './parser.js';
import { FilterStringTransformer } from './transformer.js';
import { FilterBuilder } from './builder.js';
import { createPredicate, filter as filterWithNode, isMatch, type PredicateOptions } from './predicate.js';
import { FilterNode } from './nodes.js';

const defaultParser = new FilterParserImpl();
const defaultTransformer = new FilterStringTransformer();
const defaultBuilder = new FilterBuilder();

export type FilterInput = string | FilterNode;

function toNode(expression: FilterInput): FilterNode {
  return expression instanceof FilterNode ? expression : defaultParser.parse(expression);
}

export function parse(input: string, ctx?: ParseContext | null): FilterNode {
  return defaultParser.parse(input, ctx);
}

export function stringify(node: FilterNode): string {
  return defaultTransformer.transform(node);
}

export function build(): FilterBuilder {
  return defaultBuilder;
}

export function filter<T>(data: T[], expression: FilterInput, options?: PredicateOptions): T[] {
  return filterWithNode(data, toNode(expression), options);
}

export function matches<T>(obj: T, expression: FilterInput, options?: PredicateOptions): boolean {
  return isMatch(createPredicate(toNode(expression), options), obj);
}

export function expr(input: string, ctx?: ParseContext | null): FilterNode {
  return defaultParser.parse(input, ctx);
}

export { createPredicate };
export type { PredicateOptions };
export { f } from './template.js';
export { FilterBuilder } from './builder.js';
export { FilterParserImpl } from './parser.js';
export { FilterOperatorsImpl, getDefaultOperators } from './operators.js';
export { FunctionResolver, PlaceholderResolver, ParseContextImpl } from './parser.js';
