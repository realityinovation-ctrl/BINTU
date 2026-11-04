import { useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/lib/authSession';

const welcomeArt = require('../assets/welcome-bintu.jpg');

export default function LoginScreen() {
  const router = useRouter();
  const { ready, user, deviceId, startWithDevice } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { height } = useWindowDimensions();

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1769FF" />
      </View>
    );
  }

  if (user && (getAccessToken() || user.plan === 'device' || user.plan === 'local')) {
    return <Redirect href="/" />;
  }

  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await startWithDevice();
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de démarrer. Réessayez.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ImageBackground
        source={welcomeArt}
        style={styles.hero}
        imageStyle={styles.heroImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            'rgba(2, 18, 48, 0.15)',
            'rgba(2, 18, 48, 0.35)',
            'rgba(2, 18, 48, 0.92)',
          ]}
          locations={[0, 0.45, 1]}
          style={[styles.scrim, { minHeight: height }]}
        >
          <View style={styles.topSpacer} />

          <View style={styles.bottomPanel}>
            <Text style={styles.kicker}>BINTU</Text>
            <Text style={styles.title}>
              Agent d'enquête technique{'\n'}et de diagnostic AR
            </Text>
            <Text style={styles.sub}>
              Aucun compte à créer. Cet appareil vous identifie automatiquement.
            </Text>

            <Pressable
              onPress={() => void onStart()}
              disabled={busy}
              style={({ pressed }) => [
                styles.cta,
                pressed && styles.ctaPressed,
                busy && styles.ctaDisabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaLabel}>Commencer</Text>
              )}
            </Pressable>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Text style={styles.deviceHint} numberOfLines={1}>
              Appareil · {deviceId.slice(0, 8)}…
            </Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#021230',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#021230',
  },
  hero: {
    flex: 1,
    width: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  topSpacer: {
    flex: 1,
  },
  bottomPanel: {
    paddingHorizontal: 28,
    paddingBottom: 36,
    paddingTop: 24,
    alignItems: 'center',
  },
  kicker: {
    color: '#7EB6FF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3.2,
    marginBottom: 10,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 12,
  },
  sub: {
    color: 'rgba(226, 232, 240, 0.88)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 340,
  },
  cta: {
    minWidth: 260,
    width: '100%',
    maxWidth: 340,
    height: 56,
    borderRadius: 999,
    backgroundColor: '#1769FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1769FF',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  error: {
    marginTop: 14,
    color: '#FCA5A5',
    textAlign: 'center',
    fontSize: 13,
  },
  deviceHint: {
    marginTop: 18,
    color: 'rgba(148, 163, 184, 0.9)',
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
