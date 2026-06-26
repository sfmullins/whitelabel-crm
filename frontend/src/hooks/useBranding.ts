import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Settings } from 'shared';

// Utility to calculate contrast (returns black or white)
function getContrastYIQ(hexcolor: string): string {
  const cleanHex = hexcolor.replace('#', '');
  if (cleanHex.length !== 6) return '#ffffff';
  
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#0f172a' : '#ffffff'; // returns Slate 900 for light background, white for dark
}

export function useBranding() {
  const { data: settings, isLoading, error, refetch } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (res.status === 404) {
        throw new Error('ONBOARDING_REQUIRED');
      }
      if (!res.ok) {
        throw new Error('Failed to fetch settings');
      }
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (settings) {
      const root = document.documentElement;
      
      // Inject primary color and calculate its foreground
      root.style.setProperty('--primary', settings.primaryColor);
      root.style.setProperty('--primary-foreground', getContrastYIQ(settings.primaryColor));

      // Inject secondary color and calculate its foreground
      root.style.setProperty('--secondary', settings.secondaryColor);
      root.style.setProperty('--secondary-foreground', getContrastYIQ(settings.secondaryColor));

      // Inject accent color and calculate its foreground
      root.style.setProperty('--accent', settings.accentColor);
      root.style.setProperty('--accent-foreground', getContrastYIQ(settings.accentColor));

      // Inject ring outline color
      root.style.setProperty('--ring', settings.primaryColor);

      // Set window title
      document.title = `${settings.businessName} Workspace`;
    }
  }, [settings]);

  const needsOnboarding = error?.message === 'ONBOARDING_REQUIRED';

  return {
    settings,
    isLoading,
    needsOnboarding,
    refetch,
    error
  };
}
