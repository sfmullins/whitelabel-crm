import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface RuntimeContribution {
  extensionId: string;
  packageKey: string;
  extensionName: string;
  version: string;
  key: string;
  [key: string]: unknown;
}

export interface ExtensionRuntimeRegistry {
  generatedAt: string;
  locale: string;
  packages: Array<{ id: string; packageKey: string; name: string; version: string }>;
  messages: Record<string, string>;
  forms: RuntimeContribution[];
  views: RuntimeContribution[];
  navigation: RuntimeContribution[];
  themes: RuntimeContribution[];
  reports: RuntimeContribution[];
  workflowTemplates: RuntimeContribution[];
  eventSubscriptions: RuntimeContribution[];
  localisations: RuntimeContribution[];
  customFields: RuntimeContribution[];
  customEntities: RuntimeContribution[];
  assets: RuntimeContribution[];
}

const CORE_THEME_TOKENS = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'accent',
  'accent-foreground',
  'muted',
  'muted-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'radius',
]);

export function extensionCssToken(name: string): string {
  const clean = name
    .replace(/^--/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return CORE_THEME_TOKENS.has(clean) ? `--${clean}` : `--extension-${clean || 'token'}`;
}

export function selectRuntimeTheme(
  themes: RuntimeContribution[] | undefined,
  selectedTheme: string,
): RuntimeContribution | null {
  if (!themes || themes.length === 0) return null;
  return themes.find((item) => `${item.packageKey}:${item.key}` === selectedTheme) ?? themes[0];
}

export function translateRuntimeMessage(
  messages: Record<string, string> | undefined,
  key: string,
  fallback = key,
): string {
  return messages?.[key] ?? fallback;
}

export function useExtensionRuntime(locale = navigator.language || 'en') {
  const query = useQuery<ExtensionRuntimeRegistry>({
    queryKey: ['extension-runtime', locale],
    queryFn: () => api.get(`/api/extensions/runtime?locale=${encodeURIComponent(locale)}`),
    staleTime: 30_000,
  });
  const [selectedTheme, setSelectedThemeState] = useState(
    () => window.localStorage.getItem('crm.extension.theme') || '',
  );
  const theme = useMemo(
    () => selectRuntimeTheme(query.data?.themes, selectedTheme),
    [query.data, selectedTheme],
  );

  useEffect(() => {
    const root = document.documentElement;
    const applied: string[] = [];
    if (theme && theme.tokens && typeof theme.tokens === 'object') {
      for (const [name, value] of Object.entries(theme.tokens as Record<string, unknown>)) {
        if (typeof value !== 'string') continue;
        const token = extensionCssToken(name);
        root.style.setProperty(token, value);
        applied.push(token);
      }
    }
    return () => {
      for (const token of applied) root.style.removeProperty(token);
    };
  }, [theme]);

  const selectTheme = (value: string) => {
    setSelectedThemeState(value);
    if (value) window.localStorage.setItem('crm.extension.theme', value);
    else window.localStorage.removeItem('crm.extension.theme');
  };
  const t = (key: string, fallback = key) => translateRuntimeMessage(query.data?.messages, key, fallback);

  return { ...query, registry: query.data, theme, selectedTheme, selectTheme, t };
}
