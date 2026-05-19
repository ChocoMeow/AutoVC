import type { Logger } from '@/shared/logger.ts';
import { lexTemplate } from '@/domain/naming/lexer.ts';
import { parseTokens } from '@/domain/naming/parser.ts';
import type { PlaceholderRegistry } from '@/domain/naming/placeholders/_registry.ts';
import type { TemplateContext, TemplateProfile } from '@/domain/naming/template-context.ts';

const INVALID_NAME_CHARS =
  /[^\p{L}\p{N}\p{M}\p{Emoji_Presentation}\p{Extended_Pictographic}\s\-_|'.#()[\]&+]/gu;

export interface TemplateRenderOptions {
  /** Overrides {@link TemplateContext.profile} for sanitization only. */
  profile?: TemplateProfile;
}

export class TemplateEngine {
  constructor(
    private readonly registry: PlaceholderRegistry,
    private readonly logger: Logger,
    private readonly maxChannelNameLength: number,
  ) {}

  templateNeedsLiveRefresh(template: string): boolean {
    return this.registry.templateNeedsLiveRefresh(template);
  }

  templateNeedsPresenceRefresh(template: string): boolean {
    return this.registry.templateNeedsPresenceRefresh(template);
  }

  async render(
    template: string,
    ctx: TemplateContext,
    opts?: TemplateRenderOptions,
  ): Promise<string> {
    const tokens = lexTemplate(template);
    const ast = parseTokens(tokens);
    const parts: string[] = [];

    for (const node of ast) {
      if (node.type === 'literal') {
        parts.push(node.value);
        continue;
      }

      const tokenKey = node.arg ? `${node.name}:${node.arg}` : node.name;
      const resolver =
        this.registry.get(tokenKey) ??
        this.registry.get(node.name);

      if (!resolver) {
        parts.push('');
        continue;
      }

      try {
        const value = await resolver(ctx, node.arg);
        parts.push(value);
      } catch (err) {
        this.logger.warn({ err, token: tokenKey }, 'Placeholder resolver failed');
        parts.push('');
      }
    }

    const joined = parts.join('');
    const profile = opts?.profile ?? ctx.profile;
    if (profile === 'channel') {
      return this.sanitize(joined, ctx.settings.gameFallback);
    }
    return joined;
  }

  sanitize(name: string, fallback: string): string {
    let cleaned = name.replace(INVALID_NAME_CHARS, '').trim();
    if (!cleaned) cleaned = fallback;
    return cleaned.slice(0, this.maxChannelNameLength);
  }
}
