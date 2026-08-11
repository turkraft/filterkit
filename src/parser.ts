import {
  FilterNode,
  FieldNode,
  InputNode,
  PlaceholderNode,
  PriorityNode,
  FunctionNode,
  CollectionNode,
  InfixOperationNode,
  PrefixOperationNode,
  PostfixOperationNode,
  FilterPrefixOperator,
  FilterInfixOperator,
  FilterPostfixOperator,
  FilterFunction,
  FilterPlaceholder,
} from './nodes.js';
import { getDefaultOperators, type FilterOperators, type OperatorToken } from './operators.js';
import { AndOperator, GreaterThanOrEqualOperator, LessThanOrEqualOperator } from './operators.js';

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

type Token = { type: TokenType; value?: string };

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
    super(message);
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

function tokenize(input: string, operators: FilterOperators): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  const sortedOperators = operators.getSortedOperators();

  function tryMatchKeyword(target: string, start: number): number {
    let i = 0;
    for (i = 0; i < target.length && (start + i) < input.length; i++) {
      if (input[start + i].toLowerCase() !== target[i]) return -1;
    }
    if (i >= target.length) return target.length;
    return -1;
  }

  function tryMatchAnyOperator(start: number): { type: 'PREFIX_OP' | 'INFIX_OP' | 'POSTFIX_OP' | 'BETWEEN'; value: string; len: number } | null {
    const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;
    const isAfterAtom = prevToken !== null &&
      (prevToken.type === 'ID' || prevToken.type === 'STRING' ||
       prevToken.type === 'NUMBER' || prevToken.type === 'TRUE' ||
       prevToken.type === 'FALSE' || prevToken.type === 'RPAREN' ||
       prevToken.type === 'RBRACK');

    let bestMatch: { type: 'PREFIX_OP' | 'INFIX_OP' | 'POSTFIX_OP'; value: string; operator: any; len: number } | null = null;

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

      if (op instanceof FilterPrefixOperator) {
        if (!isAfterAtom) effectiveType = 'PREFIX_OP';
      }
      if (op instanceof FilterPostfixOperator) {
        if (isAfterAtom) effectiveType = 'POSTFIX_OP';
      }
      if (op instanceof FilterInfixOperator) {
        if (isAfterAtom) effectiveType = 'INFIX_OP';
        else if (isAfterAtom === false && isNonAlphaStart) effectiveType = 'INFIX_OP';
      }

      if (effectiveType && (!bestMatch || matchLen > bestMatch.len)) {
        bestMatch = { type: effectiveType, value: token, operator: op, len: matchLen };
      }
    }

    if (bestMatch) {
      return { type: bestMatch.type, value: bestMatch.value, len: bestMatch.len };
    }
    return null;
  }

  while (pos < input.length) {
    const ch = input[pos];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      pos++;
      continue;
    }

    if (ch === "'") {
      let str = '';
      pos++;
      while (pos < input.length) {
        const c = input[pos];
        if (c === "'") {
          if (pos + 1 < input.length && input[pos + 1] === "'") {
            str += "'";
            pos += 2;
          } else {
            pos++;
            break;
          }
        } else if (c === '\\') {
          pos++;
          if (pos < input.length) {
            const next = input[pos];
            if (next === "'" || next === '\\') {
              str += next;
            } else {
              str += '\\' + next;
            }
            pos++;
          }
        } else {
          str += c;
          pos++;
        }
      }
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'LPAREN' }); pos++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN' }); pos++; continue; }
    if (ch === '[') { tokens.push({ type: 'LBRACK' }); pos++; continue; }
    if (ch === ']') { tokens.push({ type: 'RBRACK' }); pos++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA' }); pos++; continue; }
    if (ch === '.') { tokens.push({ type: 'DOT' }); pos++; continue; }
    if (ch === '`') { tokens.push({ type: 'BTICK' }); pos++; continue; }

    if (ch === '-' || (ch >= '0' && ch <= '9')) {
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
        tokens.push({ type: 'NUMBER', value: num });
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
        tokens.push({ type: 'NUMBER', value: num });
        continue;
      }
      tokens.push({ type: 'PROP', value: ch });
      pos++;
      continue;
    }

    const opResult = tryMatchAnyOperator(pos);
    if (opResult) {
      const { type, value, len } = opResult;
      if (value.toLowerCase() === 'between') {
        tokens.push({ type: 'BETWEEN', value });
      } else {
        tokens.push({ type, value });
      }
      pos += len;
      continue;
    }

    if (/[a-zA-Z_$]/.test(ch)) {
      let id = '';
      while (pos < input.length && /[a-zA-Z_$0-9]/.test(input[pos])) {
        id += input[pos];
        pos++;
      }
      const lower = id.toLowerCase();
      if (lower === 'true') { tokens.push({ type: 'TRUE' }); continue; }
      if (lower === 'false') { tokens.push({ type: 'FALSE' }); continue; }
      if (lower === 'between') { tokens.push({ type: 'BETWEEN', value: id }); continue; }
      tokens.push({ type: 'ID', value: id });
      continue;
    }

    tokens.push({ type: 'PROP', value: ch });
    pos++;
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}

class PrattParser {
  private tokens: Token[];
  private pos: number = 0;
  private operators: FilterOperators;
  private ctx: ParseContext;

  constructor(tokens: Token[], operators: FilterOperators, ctx: ParseContext) {
    this.tokens = tokens;
    this.operators = operators;
    this.ctx = ctx;
  }

  private peek(offset: number = 0): Token {
    if (this.pos + offset < this.tokens.length) {
      return this.tokens[this.pos + offset];
    }
    return { type: 'EOF' };
  }

  private consume(): Token {
    if (this.pos < this.tokens.length) {
      return this.tokens[this.pos++];
    }
    return { type: 'EOF' };
  }

  private map(node: FilterNode | null): FilterNode {
    if (node == null) return node as any;
    const mapped = this.ctx.getNodeMapper()(node);
    return mapped ?? node;
  }

  parseFilter(): FilterNode {
    const node = this.expression(0);
    if (this.peek().type !== 'EOF') {
      throw new InvalidSyntaxException(
        'Unexpected token after filter expression',
        undefined, this.pos, JSON.stringify(this.peek())
      );
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
    let left = this.atom();

    while (true) {
      const token = this.peek();

      if (token.type === 'BETWEEN' && 100 >= minPrecedence) {
        this.consume();
        const lower = this.expression(101);
        const andToken = this.peek();
        if (andToken.type !== 'INFIX_OP' || (andToken.value ?? '').toLowerCase() !== 'and') {
          throw new InvalidSyntaxException(
            `Expected 'and' after between lower bound`,
            undefined, this.pos, JSON.stringify(andToken)
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
        left = this.map(new InfixOperationNode(left, op, right));
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

    return this.map(left);
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
          throw new InvalidSyntaxException('Expected field name after \'.\'', undefined, this.pos);
        }
        name += '.' + this.ctx.getFieldMapper()(nextId.value!);
      }

      return this.map(new FieldNode(name));
    }

    throw new InvalidSyntaxException(
      `Unexpected token: ${JSON.stringify(token)}`,
      undefined, this.pos
    );
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
      throw new InvalidSyntaxException('Expected placeholder name after backtick', undefined, this.pos);
    }
    this.expect('BTICK');
    return new PlaceholderNode(PlaceholderResolver.resolve(id.value!));
  }

  private expect(type: TokenType): void {
    const tok = this.consume();
    if (tok.type !== type) {
      throw new InvalidSyntaxException(
        `Expected ${type} but found ${tok.type}`,
        undefined, this.pos - 1
      );
    }
  }
}

export class FunctionResolver {
  private static customResolver: ((name: string) => FilterFunction) | null = null;

  static setResolver(resolver: (name: string) => FilterFunction): void {
    this.customResolver = resolver;
  }

  static resolve(name: string): FilterFunction {
    if (this.customResolver) {
      return this.customResolver(name);
    }
    throw new Error(
      `Unrecognized function \`${name}\`. Register functions via FunctionResolver.setResolver().`
    );
  }
}

export class PlaceholderResolver {
  private static customResolver: ((name: string) => FilterPlaceholder) | null = null;

  static setResolver(resolver: (name: string) => FilterPlaceholder): void {
    this.customResolver = resolver;
  }

  static resolve(name: string): FilterPlaceholder {
    if (this.customResolver) {
      return this.customResolver(name);
    }
    throw new Error(
      `Unrecognized placeholder \`${name}\`. Register placeholders via PlaceholderResolver.setResolver().`
    );
  }
}

export class FilterParserImpl implements FilterParser {
  private operators: FilterOperators;

  constructor(operators?: FilterOperators) {
    this.operators = operators ?? getDefaultOperators();
  }

  parse(input: string, ctx?: ParseContext | null): FilterNode {
    const raw = tokenize(input, this.operators);
    const context = ctx ?? new ParseContextImpl();
    const parser = new PrattParser(raw, this.operators, context);
    const node = parser.parseFilter();
    return context.getNodeMapper()(node) ?? node;
  }
}
