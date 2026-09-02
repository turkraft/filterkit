import {
  FilterNode,
  FieldNode,
  InputNode,
  PlaceholderNode,
  PriorityNode,
  FunctionNode,
  CollectionNode,
  CollectionLikeNode,
  InfixOperationNode,
  PrefixOperationNode,
  PostfixOperationNode,
  FilterPrefixOperator,
  FilterInfixOperator,
  FilterPostfixOperator,
  FilterFunction,
  FilterPlaceholder,
} from './nodes.js';
import { getDefaultOperators, type FilterOperators } from './operators.js';
import {
  AndOperator,
  GreaterThanOrEqualOperator,
  LessThanOrEqualOperator,
  LikeOperator,
  InsensitiveLikeOperator,
  SizeFunction,
  TodayFunction,
  HelloWorldPlaceholder,
} from './operators.js';

type TokenType =
  | 'EOF'
  | 'ID'
  | 'STRING'
  | 'NUMBER'
  | 'TRUE'
  | 'FALSE'
  | 'DOT'
  | 'COMMA'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACK'
  | 'RBRACK'
  | 'BTICK'
  | 'BETWEEN'
  | 'PROP'
  | 'INFIX_OP'
  | 'POSTFIX_OP'
  | 'PREFIX_OP';

type Token = { type: TokenType; value?: string; pos: number };

export const DEFAULT_MAX_DEPTH = 500;

export interface FilterParserOptions {
  strict?: boolean;
  maxDepth?: number;
}

function excerpt(input: string, position: number, radius = 40): string {
  if (input.length <= radius * 2) return input;
  const start = Math.max(0, position - radius);
  const end = Math.min(input.length, position + radius);
  return (start > 0 ? '…' : '') + input.slice(start, end) + (end < input.length ? '…' : '');
}

export class InvalidSyntaxException extends Error {
  public readonly input?: string;
  public readonly position?: number;
  public readonly offendingSymbol?: string;

  constructor(
    message: string,
    input?: string,
    position?: number,
    offendingSymbol?: string
  ) {
    super(
      position != null && input != null
        ? `${message} (at position ${position} in \`${excerpt(input, position)}\`)`
        : message
    );
    this.name = 'InvalidSyntaxException';
    this.input = input;
    this.position = position;
    this.offendingSymbol = offendingSymbol;
  }
}

export interface ParseContext {
  getFieldMapper(): (name: string) => string;
  getNodeMapper(): (node: FilterNode) => FilterNode;
}

export class ParseContextImpl implements ParseContext {
  private fieldMapper: ((name: string) => string) | null = null;
  private nodeMapper: ((node: FilterNode) => FilterNode) | null = null;

  constructor(
    fieldMapper?: (name: string) => string,
    nodeMapper?: (node: FilterNode) => FilterNode
  ) {
    this.fieldMapper = fieldMapper ?? null;
    this.nodeMapper = nodeMapper ?? null;
  }

  getFieldMapper(): (name: string) => string {
    return this.fieldMapper ?? ((n: string) => n);
  }

  setFieldMapper(mapper: (name: string) => string): void {
    this.fieldMapper = mapper;
  }

  getNodeMapper(): (node: FilterNode) => FilterNode {
    return this.nodeMapper ?? ((n: FilterNode) => n);
  }

  setNodeMapper(mapper: (node: FilterNode) => FilterNode): void {
    this.nodeMapper = mapper;
  }
}

export interface FilterParser {
  parse(input: string, ctx?: ParseContext | null): FilterNode;
}

const IDENTIFIER_START = /[a-zA-Z_$]/;
const IDENTIFIER_PART = /[a-zA-Z_$0-9]/;

function tokenize(input: string, operators: FilterOperators, strict: boolean): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  const sortedOperators = operators.getSortedOperators();

  function fail(message: string, at: number, symbol?: string): never {
    throw new InvalidSyntaxException(message, input, at, symbol);
  }

  function tryMatchKeyword(target: string, start: number): number {
    let i = 0;
    for (i = 0; i < target.length && (start + i) < input.length; i++) {
      if (input[start + i].toLowerCase() !== target[i]) return -1;
    }
    if (i >= target.length) return target.length;
    return -1;
  }

  function identifierLength(start: number): number {
    if (start >= input.length || !IDENTIFIER_START.test(input[start])) return 0;
    let i = start + 1;
    while (i < input.length && IDENTIFIER_PART.test(input[i])) i++;
    return i - start;
  }

  function operatorType(op: unknown): 'PREFIX_OP' | 'INFIX_OP' | 'POSTFIX_OP' {
    if (op instanceof FilterPrefixOperator) return 'PREFIX_OP';
    if (op instanceof FilterPostfixOperator) return 'POSTFIX_OP';
    return 'INFIX_OP';
  }

  let insidePlaceholder = false;

  function tryMatchAnyOperator(start: number): { type: 'PREFIX_OP' | 'INFIX_OP' | 'POSTFIX_OP'; value: string; len: number } | null {
    const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;
    const isAfterAtom = prevToken !== null &&
      (prevToken.type === 'ID' || prevToken.type === 'STRING' ||
       prevToken.type === 'NUMBER' || prevToken.type === 'TRUE' ||
       prevToken.type === 'FALSE' || prevToken.type === 'RPAREN' ||
       prevToken.type === 'RBRACK' || prevToken.type === 'POSTFIX_OP' ||
       (prevToken.type === 'BTICK' && !insidePlaceholder));

    let bestMatch: { type: 'PREFIX_OP' | 'INFIX_OP' | 'POSTFIX_OP'; value: string; len: number } | null = null;

    for (const { operator: op, token } of sortedOperators) {
      const matchLen = tryMatchKeyword(token, start);
      if (matchLen < 0) continue;

      const afterMatch = start + matchLen;
      const isWordBoundaryAfter = afterMatch >= input.length ||
        input[afterMatch] === ' ' || input[afterMatch] === '\t' ||
        input[afterMatch] === '\n' || input[afterMatch] === '\r' ||
        input[afterMatch] === '(' || input[afterMatch] === ')' ||
        input[afterMatch] === '[' || input[afterMatch] === ']' ||
        input[afterMatch] === ',' || input[afterMatch] === "'" ||
        input[afterMatch] === '`' || input[afterMatch] === '.';

      const isNonAlphaStart = !/[a-z]/i.test(token[0]);

      if (!isWordBoundaryAfter && !isNonAlphaStart) continue;

      let effectiveType: 'PREFIX_OP' | 'INFIX_OP' | 'POSTFIX_OP' | null = null;

      if (strict) {
        effectiveType = operatorType(op);
      } else {
        if (op instanceof FilterPrefixOperator) {
          if (!isAfterAtom) effectiveType = 'PREFIX_OP';
        }
        if (op instanceof FilterPostfixOperator) {
          if (isAfterAtom) effectiveType = 'POSTFIX_OP';
        }
        if (op instanceof FilterInfixOperator) {
          if (isAfterAtom) effectiveType = 'INFIX_OP';
          else if (isNonAlphaStart) effectiveType = 'INFIX_OP';
        }
      }

      if (effectiveType && (!bestMatch || matchLen > bestMatch.len)) {
        bestMatch = { type: effectiveType, value: token, len: matchLen };
      }
    }

    if (!bestMatch) return null;

    const identLen = identifierLength(start);
    if (identLen > bestMatch.len) return null;

    return bestMatch;
  }

  while (pos < input.length) {
    const ch = input[pos];

    if (ch === ' ' || ch === '\t') {
      pos++;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      if (strict) {
        fail('Line breaks are not valid whitespace in strict mode', pos, ch);
      }
      pos++;
      continue;
    }

    if (ch === "'") {
      const start = pos;
      let str = '';
      let terminated = false;
      pos++;
      while (pos < input.length) {
        const c = input[pos];
        if (c === "'") {
          if (!strict && pos + 1 < input.length && input[pos + 1] === "'") {
            str += "'";
            pos += 2;
          } else {
            pos++;
            terminated = true;
            break;
          }
        } else if (c === '\\') {
          const next = pos + 1 < input.length ? input[pos + 1] : undefined;
          if (next === "'" || next === '\\') {
            str += next;
            pos += 2;
          } else if (next === undefined) {
            fail('Unterminated escape sequence in string literal', pos, '\\');
          } else if (strict) {
            fail(
              `Invalid escape sequence \`\\${next}\` in string literal, only \\' and \\\\ are supported`,
              pos,
              '\\' + next
            );
          } else {
            str += '\\' + next;
            pos += 2;
          }
        } else {
          str += c;
          pos++;
        }
      }
      if (!terminated) {
        fail('Unterminated string literal', start, "'");
      }
      tokens.push({ type: 'STRING', value: str, pos: start });
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'LPAREN', pos }); pos++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', pos }); pos++; continue; }
    if (ch === '[') { tokens.push({ type: 'LBRACK', pos }); pos++; continue; }
    if (ch === ']') { tokens.push({ type: 'RBRACK', pos }); pos++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', pos }); pos++; continue; }
    if (ch === '.') { tokens.push({ type: 'DOT', pos }); pos++; continue; }
    if (ch === '`') {
      insidePlaceholder = !insidePlaceholder;
      tokens.push({ type: 'BTICK', pos });
      pos++;
      continue;
    }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const start = pos;
      if (ch === '-' && pos + 1 < input.length && input[pos + 1] >= '0' && input[pos + 1] <= '9') {
        pos++;
        let num = '-';
        while (pos < input.length && input[pos] >= '0' && input[pos] <= '9') {
          num += input[pos];
          pos++;
        }
        if (pos < input.length && input[pos] === '.') {
          num += '.';
          pos++;
          while (pos < input.length && input[pos] >= '0' && input[pos] <= '9') {
            num += input[pos];
            pos++;
          }
        }
        tokens.push({ type: 'NUMBER', value: num, pos: start });
        continue;
      } else if (ch >= '0' && ch <= '9') {
        let num = '';
        while (pos < input.length && input[pos] >= '0' && input[pos] <= '9') {
          num += input[pos];
          pos++;
        }
        if (pos < input.length && input[pos] === '.') {
          num += '.';
          pos++;
          while (pos < input.length && input[pos] >= '0' && input[pos] <= '9') {
            num += input[pos];
            pos++;
          }
        }
        tokens.push({ type: 'NUMBER', value: num, pos: start });
        continue;
      }
      tokens.push({ type: 'PROP', value: ch, pos: start });
      pos++;
      continue;
    }

    const opResult = tryMatchAnyOperator(pos);
    if (opResult) {
      tokens.push({ type: opResult.type, value: opResult.value, pos });
      pos += opResult.len;
      continue;
    }

    if (IDENTIFIER_START.test(ch)) {
      const start = pos;
      let id = '';
      while (pos < input.length && IDENTIFIER_PART.test(input[pos])) {
        id += input[pos];
        pos++;
      }
      const isKeyword = (lower: string, word: string) =>
        strict ? (word === lower || word === lower.toUpperCase()) : word.toLowerCase() === lower;
      if (isKeyword('true', id)) { tokens.push({ type: 'TRUE', pos: start }); continue; }
      if (isKeyword('false', id)) { tokens.push({ type: 'FALSE', pos: start }); continue; }
      if (isKeyword('between', id)) { tokens.push({ type: 'BETWEEN', value: id, pos: start }); continue; }
      tokens.push({ type: 'ID', value: id, pos: start });
      continue;
    }

    tokens.push({ type: 'PROP', value: ch, pos });
    pos++;
  }

  tokens.push({ type: 'EOF', pos: input.length });
  return tokens;
}

function expandLikeCollection(node: FilterNode): FilterNode {
  if (!(node instanceof InfixOperationNode)) return node;
  const operator = node.getOperator();
  if (!(operator instanceof LikeOperator) && !(operator instanceof InsensitiveLikeOperator)) {
    return node;
  }
  const right = node.getRight();
  if (!(right instanceof CollectionNode)) return node;
  if (right.getItems().length === 0) return node;
  return new CollectionLikeNode(node.getLeft(), operator, right.getItems());
}

class PrattParser {
  private tokens: Token[];
  private pos: number = 0;
  private operators: FilterOperators;
  private ctx: ParseContext;
  private input: string;
  private maxDepth: number;
  private depth: number = 0;

  constructor(
    tokens: Token[],
    operators: FilterOperators,
    ctx: ParseContext,
    input: string,
    maxDepth: number
  ) {
    this.tokens = tokens;
    this.operators = operators;
    this.ctx = ctx;
    this.input = input;
    this.maxDepth = maxDepth;
  }

  private peek(offset: number = 0): Token {
    if (this.pos + offset < this.tokens.length) {
      return this.tokens[this.pos + offset];
    }
    return this.tokens[this.tokens.length - 1];
  }

  private consume(): Token {
    if (this.pos < this.tokens.length - 1) {
      return this.tokens[this.pos++];
    }
    return this.tokens[this.tokens.length - 1];
  }

  private describe(token: Token): string {
    if (token.type === 'EOF') return 'end of input';
    return token.value != null ? `\`${token.value}\`` : `\`${token.type}\``;
  }

  private fail(message: string, token: Token): never {
    throw new InvalidSyntaxException(message, this.input, token.pos, token.value);
  }

  private map(node: FilterNode): FilterNode {
    const mapped = this.ctx.getNodeMapper()(node);
    return mapped ?? node;
  }

  private enter(token: Token): void {
    if (++this.depth > this.maxDepth) {
      throw new InvalidSyntaxException(
        `Expression nesting is too deep (limit ${this.maxDepth})`,
        this.input,
        token.pos,
        token.value
      );
    }
  }

  private exit(): void {
    this.depth--;
  }

  parseFilter(): FilterNode {
    const node = this.expression(0);
    const next = this.peek();
    if (next.type !== 'EOF') {
      this.fail(`Unexpected ${this.describe(next)} after filter expression`, next);
    }
    return node;
  }

  private getPrecedence(token: Token): number {
    switch (token.type) {
      case 'INFIX_OP':
        return this.operators.getInfixOperator(token.value!).getPriority();
      case 'POSTFIX_OP':
        return this.operators.getPostfixOperator(token.value!).getPriority();
      case 'PREFIX_OP':
        return this.operators.getPrefixOperator(token.value!).getPriority();
      case 'BETWEEN':
        return 100;
      default:
        return 0;
    }
  }

  private getNextPrecedence(token: Token): number {
    if (token.type === 'BETWEEN') return 101;
    const p = this.getPrecedence(token);
    if (token.type === 'INFIX_OP') return p + 1;
    return p;
  }

  private expression(minPrecedence: number): FilterNode {
    this.enter(this.peek());
    try {
      let left = this.atom();

      while (true) {
        const token = this.peek();

        if (token.type === 'BETWEEN' && 100 >= minPrecedence) {
          this.consume();
          const lower = this.expression(101);
          const andToken = this.peek();
          if (andToken.type !== 'INFIX_OP' || (andToken.value ?? '').toLowerCase() !== 'and') {
            this.fail(
              `Expected \`and\` after between lower bound but found ${this.describe(andToken)}`,
              andToken
            );
          }
          this.consume();
          const upper = this.expression(101);

          const gte = this.operators.getInfixOperatorByType(GreaterThanOrEqualOperator);
          const lte = this.operators.getInfixOperatorByType(LessThanOrEqualOperator);
          const andOp = this.operators.getInfixOperatorByType(AndOperator);

          left = this.map(andOp.toNode(
            gte.toNode(left, lower),
            lte.toNode(left, upper)
          ));
          continue;
        }

        if (token.type === 'INFIX_OP' && this.getPrecedence(token) >= minPrecedence) {
          this.consume();
          const op = this.operators.getInfixOperator(token.value!);
          const right = this.expression(this.getNextPrecedence(token));
          left = this.map(expandLikeCollection(new InfixOperationNode(left, op, right)));
          continue;
        }

        if (token.type === 'POSTFIX_OP' && this.getPrecedence(token) >= minPrecedence) {
          this.consume();
          const op = this.operators.getPostfixOperator(token.value!);
          left = this.map(new PostfixOperationNode(left, op));
          continue;
        }

        break;
      }

      return left;
    } finally {
      this.exit();
    }
  }

  private atom(): FilterNode {
    const token = this.peek();

    if (token.type === 'LPAREN') {
      this.consume();
      const node = this.expression(0);
      this.expect('RPAREN');
      return this.map(new PriorityNode(node));
    }

    if (token.type === 'PREFIX_OP') {
      this.consume();
      const op = this.operators.getPrefixOperator(token.value!);
      const right = this.expression(this.getNextPrecedence(token));
      return this.map(new PrefixOperationNode(op, right));
    }

    if (token.type === 'TRUE') {
      this.consume();
      return this.map(new InputNode(true));
    }

    if (token.type === 'FALSE') {
      this.consume();
      return this.map(new InputNode(false));
    }

    if (token.type === 'STRING') {
      this.consume();
      return this.map(new InputNode(token.value!));
    }

    if (token.type === 'NUMBER') {
      this.consume();
      const n = token.value!.includes('.') ? parseFloat(token.value!) : parseInt(token.value!, 10);
      return this.map(new InputNode(n));
    }

    if (token.type === 'LBRACK') {
      return this.map(this.parseCollection());
    }

    if (token.type === 'BTICK') {
      return this.map(this.parsePlaceholder());
    }

    if (token.type === 'ID') {
      const idToken = this.consume();
      const idName = idToken.value!;

      if (this.peek().type === 'LPAREN') {
        this.consume();
        const args: FilterNode[] = [];
        if (this.peek().type !== 'RPAREN') {
          args.push(this.expression(0));
          while (this.peek().type === 'COMMA') {
            this.consume();
            args.push(this.expression(0));
          }
        }
        this.expect('RPAREN');
        return this.map(new FunctionNode(
          FunctionResolver.resolve(idName),
          args
        ));
      }

      let name = this.ctx.getFieldMapper()(idName);
      while (this.peek().type === 'DOT') {
        this.consume();
        const nextId = this.consume();
        if (nextId.type !== 'ID') {
          this.fail(`Expected a field name after \`.\` but found ${this.describe(nextId)}`, nextId);
        }
        name += '.' + this.ctx.getFieldMapper()(nextId.value!);
      }

      return this.map(new FieldNode(name));
    }

    this.fail(`Unexpected ${this.describe(token)}`, token);
  }

  private parseCollection(): CollectionNode {
    this.expect('LBRACK');
    const items: FilterNode[] = [];
    if (this.peek().type !== 'RBRACK') {
      items.push(this.expression(0));
      while (this.peek().type === 'COMMA') {
        this.consume();
        items.push(this.expression(0));
      }
    }
    this.expect('RBRACK');
    return new CollectionNode(items);
  }

  private parsePlaceholder(): PlaceholderNode {
    this.expect('BTICK');
    const id = this.consume();
    if (id.type !== 'ID') {
      this.fail(`Expected a placeholder name after \`\`\` but found ${this.describe(id)}`, id);
    }
    this.expect('BTICK');
    return new PlaceholderNode(PlaceholderResolver.resolve(id.value!));
  }

  private expect(type: TokenType): void {
    const tok = this.consume();
    if (tok.type !== type) {
      this.fail(`Expected ${type} but found ${this.describe(tok)}`, tok);
    }
  }
}

export class FunctionResolver {
  private static customResolver: ((name: string) => FilterFunction | null | undefined) | null = null;

  static setResolver(resolver: (name: string) => FilterFunction | null | undefined): void {
    this.customResolver = resolver;
  }

  private static builtIn(name: string): FilterFunction | null {
    if (name === 'size') return new SizeFunction();
    if (name === 'today') return new TodayFunction();
    return null;
  }

  static resolve(name: string): FilterFunction {
    let customError: unknown;
    if (this.customResolver) {
      try {
        const resolved = this.customResolver(name);
        if (resolved) return resolved;
      } catch (e) {
        customError = e;
      }
    }
    const builtIn = this.builtIn(name);
    if (builtIn) return builtIn;
    if (customError !== undefined) throw customError;
    throw new Error(
      `Unrecognized function \`${name}\`. Register functions via FunctionResolver.setResolver().`
    );
  }
}

export class PlaceholderResolver {
  private static customResolver: ((name: string) => FilterPlaceholder | null | undefined) | null = null;

  private static builtIn(name: string): FilterPlaceholder | null {
    if (name === 'hello') return new HelloWorldPlaceholder();
    return null;
  }

  static setResolver(resolver: (name: string) => FilterPlaceholder | null | undefined): void {
    this.customResolver = resolver;
  }

  static resolve(name: string): FilterPlaceholder {
    let customError: unknown;
    if (this.customResolver) {
      try {
        const resolved = this.customResolver(name);
        if (resolved) return resolved;
      } catch (e) {
        customError = e;
      }
    }
    const builtIn = this.builtIn(name);
    if (builtIn) return builtIn;
    if (customError !== undefined) throw customError;
    throw new Error(
      `Unrecognized placeholder \`${name}\`. Register placeholders via PlaceholderResolver.setResolver().`
    );
  }
}

export class FilterParserImpl implements FilterParser {
  private operators: FilterOperators;
  private strict: boolean;
  private maxDepth: number;

  constructor(operators?: FilterOperators, options?: FilterParserOptions) {
    this.operators = operators ?? getDefaultOperators();
    this.strict = options?.strict ?? false;
    this.maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  getOperators(): FilterOperators {
    return this.operators;
  }

  parse(input: string, ctx?: ParseContext | null): FilterNode {
    const raw = tokenize(input, this.operators, this.strict);
    const context = ctx ?? new ParseContextImpl();
    const parser = new PrattParser(raw, this.operators, context, input, this.maxDepth);
    return parser.parseFilter();
  }
}
