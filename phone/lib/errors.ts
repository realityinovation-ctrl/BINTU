/**
 * Messages d’erreur : détail technique en développement,
 * formulation utilisateur en production.
 */

import { Platform } from 'react-native';

export function isProductionApp(): boolean {
  const raw = (process.env.EXPO_PUBLIC_ENV || '').trim().toLowerCase();
  if (raw === 'production' || raw === 'prod') return true;
  if (raw === 'development' || raw === 'dev') return false;
  // Expo : __DEV__ true en bundler local.
  if (typeof __DEV__ === 'boolean') return !__DEV__;
  return false;
}

const PROD_FALLBACK_FR =
  'Une erreur est survenue. Réessayez dans un instant.';
const PROD_FALLBACK_EN = 'Something went wrong. Please try again shortly.';

function mapProdMessage(raw: string, locale: 'fr' | 'en'): string {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (!text) return locale === 'fr' ? PROD_FALLBACK_FR : PROD_FALLBACK_EN;

  if (/quota|limit|429|trop de/.test(lower)) {
    return locale === 'fr'
      ? 'Quota atteint pour aujourd’hui. Réessayez demain ou passez en compte pro.'
      : 'Daily quota reached. Try again tomorrow or upgrade your plan.';
  }
  if (/auth|401|session|connexion|login|token/.test(lower)) {
    return locale === 'fr'
      ? 'Session expirée. Reconnectez-vous pour continuer.'
      : 'Session expired. Sign in again to continue.';
  }
  if (/permission|403|refus/.test(lower)) {
    return locale === 'fr'
      ? 'Action non autorisée pour ce compte.'
      : 'This account is not allowed to perform that action.';
  }
  if (/404|not found|introuvable/.test(lower)) {
    return locale === 'fr'
      ? 'Élément introuvable.'
      : 'Item not found.';
  }
  if (/network|fetch|failed to fetch|timeout|timed out|econn|offline/.test(lower)) {
    return locale === 'fr'
      ? 'Réseau indisponible. Vérifiez votre connexion.'
      : 'Network unavailable. Check your connection.';
  }
  if (/provider|gemini|openai|meta|ai |llm|502|503|504/.test(lower)) {
    return locale === 'fr'
      ? 'Le moteur d’analyse est momentanément indisponible.'
      : 'The analysis engine is temporarily unavailable.';
  }
  if (/camera|micro|média|media|secure|https|getusermedia/.test(lower)) {
    // Les messages média sont déjà rédigés pour l’utilisateur.
    return text;
  }
  // Message API déjà court et lisible : on le garde.
  if (text.length <= 160 && !/traceback|exception|stack|sql|pymysql|at 0x/i.test(text)) {
    return text;
  }
  return locale === 'fr' ? PROD_FALLBACK_FR : PROD_FALLBACK_EN;
}

export function userFacingError(
  error: unknown,
  fallback: string,
  locale: 'fr' | 'en' = 'fr',
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;

  if (!isProductionApp()) {
    const detail = String(raw || fallback).trim() || fallback;
    const prefix = Platform.OS === 'web' ? '[dev] ' : '';
    return `${prefix}${detail}`;
  }
  return mapProdMessage(String(raw || ''), locale) || fallback;
}
