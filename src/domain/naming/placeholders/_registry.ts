import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexTemplate } from '@/domain/naming/lexer.ts';
import type { TemplateContext } from '@/domain/naming/template-context.ts';

export type PlaceholderResolver = (
  ctx: TemplateContext,
  arg?: string,
) => string | Promise<string>;

export type PlaceholderModuleResolve = (
  ctx: TemplateContext,
  token: string,
  arg?: string,
) => string | Promise<string>;

export interface PlaceholderModule {
  tokens: string[];
  /** Value may change while a temp channel is open — enable live name refresh. */
  volatile?: boolean;
  /** Re-run refresh when a member's presence changes (implies volatile). */
  presence?: boolean;
  resolve: PlaceholderModuleResolve;
}

export class PlaceholderRegistry {
  private readonly resolvers = new Map<string, PlaceholderResolver>();
  private readonly volatileTokens = new Set<string>();
  private readonly presenceTokens = new Set<string>();

  register(token: string, resolver: PlaceholderResolver, opts?: { volatile?: boolean; presence?: boolean }): void {
    this.resolvers.set(token, resolver);
    if (opts?.volatile) this.volatileTokens.add(token);
    if (opts?.presence) {
      this.volatileTokens.add(token);
      this.presenceTokens.add(token);
    }
  }

  get(token: string): PlaceholderResolver | undefined {
    return this.resolvers.get(token);
  }

  templateNeedsLiveRefresh(template: string): boolean {
    return this.templateUsesTokenSet(template, this.volatileTokens);
  }

  templateNeedsPresenceRefresh(template: string): boolean {
    return this.templateUsesTokenSet(template, this.presenceTokens);
  }

  private templateUsesTokenSet(template: string, tokens: Set<string>): boolean {
    if (!tokens.size) return false;

    for (const lex of lexTemplate(template)) {
      if (lex.type !== 'placeholder') continue;

      const colon = lex.raw.indexOf(':');
      const name = colon === -1 ? lex.raw : lex.raw.slice(0, colon);
      const withArg = colon === -1 ? name : lex.raw;

      if (tokens.has(withArg) || tokens.has(name)) return true;
    }

    return false;
  }
}

const currentDir = dirname(fileURLToPath(import.meta.url));

export async function buildRegistry(
  dir = join(currentDir, 'builtin'),
): Promise<PlaceholderRegistry> {
  const registry = new PlaceholderRegistry();
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.ts') && !f.startsWith('_'),
  );

  for (const file of files) {
    const mod = (await import(join(dir, file))) as { default: PlaceholderModule };
    const placeholder = mod.default;
    const opts = {
      volatile: placeholder.volatile,
      presence: placeholder.presence,
    };

    for (const token of placeholder.tokens) {
      registry.register(token, (ctx, arg) => placeholder.resolve(ctx, token, arg), opts);
    }
  }

  return registry;
}
