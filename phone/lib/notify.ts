/**
 * Alert.alert est souvent invisible sur Expo Web / Chrome.
 * Sur web : window.alert + optionnellement un callback chat.
 */

import { Alert, Platform } from 'react-native';

export function notifyBintu(
  message: string,
  options?: { title?: string; onWebChat?: (text: string) => void },
): void {
  const title = options?.title ?? 'BINTU';
  const text = String(message || '').trim() || 'Action impossible.';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    options?.onWebChat?.(text);
    try {
      window.alert(`${title}\n\n${text}`);
    } catch {
      // ignore
    }
    return;
  }
  Alert.alert(title, text);
}
