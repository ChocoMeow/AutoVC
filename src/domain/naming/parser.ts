import type { Token } from '@/domain/naming/lexer.ts';

export interface PlaceholderNode {
  type: 'placeholder';
  name: string;
  arg?: string;
}

export interface LiteralNode {
  type: 'literal';
  value: string;
}

export type AstNode = LiteralNode | PlaceholderNode;

export function parseTokens(tokens: Token[]): AstNode[] {
  return tokens.map((token) => {
    if (token.type === 'literal') {
      return { type: 'literal', value: token.value };
    }

    const colon = token.raw.indexOf(':');
    if (colon === -1) {
      return { type: 'placeholder', name: token.raw };
    }

    return {
      type: 'placeholder',
      name: token.raw.slice(0, colon),
      arg: token.raw.slice(colon + 1) || undefined,
    };
  });
}
