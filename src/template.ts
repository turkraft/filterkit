import { parse, stringify } from './filterkit.js';
import { FilterNode } from './nodes.js';

function serializeValue(val: unknown): string {
  if (val === null || val === undefined) {
    throw new Error(`Cannot interpolate ${val} in filter expression.`);
  }

  if (val instanceof FilterNode) {
    return stringify(val);
  }

  if (Array.isArray(val)) {
    const items = val.map(serializeValue).join(', ');
    return `[${items}]`;
  }

  if (typeof val === 'string') {
    const escaped = val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${escaped}'`;
  }

  if (typeof val === 'boolean') {
    return String(val);
  }

  if (typeof val === 'number') {
    return String(val);
  }

  throw new Error(`Cannot interpolate type ${typeof val} in filter expression.`);
}

export function f(strings: TemplateStringsArray, ...values: unknown[]): FilterNode {
  let expr = '';
  for (let i = 0; i < strings.length; i++) {
    expr += strings[i];
    if (i < values.length) {
      expr += serializeValue(values[i]);
    }
  }

  const trimmed = expr.trim();
  if (!trimmed) {
    throw new Error('Filter expression cannot be empty.');
  }

  return parse(trimmed);
}
