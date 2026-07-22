import { describe, expect, it } from 'vitest';
import {
  extensionCssToken,
  selectRuntimeTheme,
  translateRuntimeMessage,
  type RuntimeContribution,
} from './useExtensionRuntime';

function theme(packageKey: string, key: string): RuntimeContribution {
  return {
    extensionId: `${packageKey}-${key}`,
    packageKey,
    extensionName: packageKey,
    version: '1.0.0',
    key,
    tokens: {},
  };
}

describe('extension runtime helpers', () => {
  it('preserves approved core CSS variables and namespaces extension variables', () => {
    expect(extensionCssToken('--Primary')).toBe('--primary');
    expect(extensionCssToken('vendor Accent Shade')).toBe('--extension-vendor-accent-shade');
    expect(extensionCssToken('---')).toBe('--extension-token');
  });

  it('selects an explicitly requested theme and otherwise uses the first active theme', () => {
    const themes = [theme('vendor.alpha', 'light'), theme('vendor.beta', 'dark')];

    expect(selectRuntimeTheme(themes, 'vendor.beta:dark')).toBe(themes[1]);
    expect(selectRuntimeTheme(themes, 'missing:theme')).toBe(themes[0]);
    expect(selectRuntimeTheme([], '')).toBeNull();
    expect(selectRuntimeTheme(undefined, '')).toBeNull();
  });

  it('uses runtime localisation messages without losing explicit fallbacks', () => {
    const messages = { 'navigation.cases': 'Cases' };

    expect(translateRuntimeMessage(messages, 'navigation.cases')).toBe('Cases');
    expect(translateRuntimeMessage(messages, 'navigation.missing', 'Work')).toBe('Work');
    expect(translateRuntimeMessage(undefined, 'navigation.missing')).toBe('navigation.missing');
  });
});
