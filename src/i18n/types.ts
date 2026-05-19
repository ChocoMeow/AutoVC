import type { en } from '@/i18n/locales/en.ts';

/** All user-facing strings; values are translated per locale. */
export type Messages = {
  [K in keyof typeof en]: (typeof en)[K] extends object
    ? { [P in keyof (typeof en)[K]]: (typeof en)[K][P] extends object ? DeepString<(typeof en)[K][P]> : string }
    : string;
};

type DeepString<T> = {
  [K in keyof T]: T[K] extends object ? DeepString<T[K]> : string;
};

type DeepKeyOf<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Record<string, unknown>
      ? DeepKeyOf<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

export type MessageKey = DeepKeyOf<typeof en>;
