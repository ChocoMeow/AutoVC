export type Token =
  | { type: 'literal'; value: string }
  | { type: 'placeholder'; raw: string };

export function lexTemplate(template: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let literal = '';

  while (i < template.length) {
    if (template[i] === '\\' && template[i + 1] === '{') {
      literal += '{';
      i += 2;
      continue;
    }

    if (template[i] === '{') {
      if (literal) {
        tokens.push({ type: 'literal', value: literal });
        literal = '';
      }

      const close = template.indexOf('}', i);
      if (close === -1) {
        literal += template.slice(i);
        break;
      }

      const raw = template.slice(i + 1, close);
      tokens.push({ type: 'placeholder', raw });
      i = close + 1;
      continue;
    }

    literal += template[i];
    i++;
  }

  if (literal) tokens.push({ type: 'literal', value: literal });
  return tokens;
}
