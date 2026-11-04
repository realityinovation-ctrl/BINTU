import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ImageBackground,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  HelpCircle,
  Home,
  Info,
  LogOut,
  Menu,
  Mic,
  Moon,
  Share2,
  Sun,
  X,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { BintuLogo } from '@/components/BintuLogo';
import { ArLiveCard } from '@/components/ArLiveCard';
import {
  DiagnosticChat,
  makeBotMessage,
  makeUserMessage,
  type BintuChatMessage,
} from '@/components/DiagnosticChat';
import { copy, type Locale, type ReportItem } from '@/lib/i18n';
import {
  createInvestigation,
  downloadReportPdf,
  generateReport,
  getConversation,
  getInvestigation,
  getInvestigationReport,
  apiOrigin,
  listInvestigations,
  memoryBrief,
  requestVisionBoxes,
  sendMessage,
  submitMeasurement,
  uploadImage,
  type Investigation,
  type InvestigationSummary,
  type OverlayPayload,
} from '@/lib/api';
import { wantsReport } from '@/lib/reportIntent';
import { Chat } from '@kesha-antonov/react-native-chat';
import { openLiveSession, type LiveSession, type LiveServerEvent } from '@/lib/live';
import {
  flushPlayback,
  isRealtimeVoiceSupported,
  playPcm16Base64,
  startMicCapture,
} from '@/lib/realtimeVoice';
import { startLiveVision } from '@/lib/liveVision';
import {
  acquireLiveAvStream,
  acquireMicStream,
  explainMediaError,
  isSecureMediaContext,
  suggestedHttpsUrl,
} from '@/lib/mediaAccess';
import { userFacingError } from '@/lib/errors';
import { notifyBintu } from '@/lib/notify';
import {
  messagesFromInvestigation,
  messagesFromTurns,
  reportFromInvestigation,
} from '@/lib/rebuildConversation';
import {
  extractOverlayJson,
  overlayFromGemini,
  overlayFromSpeech,
  wantsClearOverlay,
  wantsSpatialGuide,
} from '@/lib/liveOverlay';
type ThemeMode = 'light' | 'dark';
type TabKey = 'home' | 'history' | 'reports' | 'more';
type Flow =
  | { name: 'tabs' }
  | { name: 'chat' }
  | { name: 'camera' }
  | { name: 'measure' }
  | { name: 'result' }
  | { name: 'report'; id: string }
  | { name: 'about' }
  | { name: 'help' }
  | { name: 'notifications' };

type Palette = {
  bg: string;
  card: string;
  soft: string;
  text: string;
  muted: string;
  border: string;
  blue: string;
  blueSoft: string;
  orange: string;
  green: string;
  input: string;
};

const light: Palette = {
  bg: '#F4F7FF',
  card: '#FFFFFF',
  soft: '#EAF1FF',
  text: '#0E1F4B',
  muted: '#7A88A5',
  border: '#DCE5F5',
  blue: '#1769FF',
  blueSoft: '#E8F0FF',
  orange: '#FF8A14',
  green: '#16C784',
  input: '#FFFFFF',
};

const dark: Palette = {
  bg: '#071426',
  card: '#10243F',
  soft: '#0B1B32',
  text: '#F4F7FF',
  muted: '#9BB0CC',
  border: '#234066',
  blue: '#3F84FF',
  blueSoft: '#15345F',
  orange: '#FF941F',
  green: '#16C784',
  input: '#0B1B32',
};

const APP_MAX = 430;

function BrandMark({ size = 88 }: { size?: number }) {
  return (
    <View style={[styles.logoWrap, { width: size, height: size }]}>
      <BintuLogo size={size} id={`mark-${size}`} />
    </View>
  );
}

function TopBar({
  colors,
  left,
  right,
  center,
}: {
  colors: Palette;
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
}) {
  return (
    <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
      <View style={styles.topSide}>{left}</View>
      <View style={styles.topCenter}>{center}</View>
      <View style={[styles.topSide, styles.topSideRight]}>{right}</View>
    </View>
  );
}

function PillButton({
  label,
  onPress,
  colors,
  ghost,
  icon,
}: {
  label: string;
  onPress: () => void;
  colors: Palette;
  ghost?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.pill,
        ghost
          ? { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1.5 }
          : { backgroundColor: colors.blue },
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {icon}
      <Text style={[styles.pillText, { color: ghost ? colors.text : '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const system = useColorScheme();
  const { width, height } = useWindowDimensions();
  const phone = Math.min(width, APP_MAX);
  const router = useRouter();
  const { user, quota, signOut } = useAuth();

  const [mode, setMode] = useState<ThemeMode>(system === 'dark' ? 'dark' : 'light');
  const [locale, setLocale] = useState<Locale>('fr');
  const [tab, setTab] = useState<TabKey>('home');
  const [flow, setFlow] = useState<Flow>({ name: 'tabs' });
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [notifOn, setNotifOn] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const micCaptureRef = useRef<{ stop: () => void } | null>(null);
  const visionCaptureRef = useRef<{ stop: () => void } | null>(null);
  /** Stream acquis dans le geste utilisateur (avant await WebSocket). */
  const pendingAvStreamRef = useRef<MediaStream | null>(null);
  /** Stream AV partagé (micro+cam) — à stopper à la fermeture Live. */
  const sharedAvStreamRef = useRef<MediaStream | null>(null);
  const micStartedWithCamRef = useRef(false);
  const lastJpegRef = useRef<string | null>(null);
  const overlayBusyRef = useRef(false);
  const [voiceCaption, setVoiceCaption] = useState('');

  const colors = mode === 'dark' ? dark : light;
  const t = copy[locale];
  const [caseId, setCaseId] = useState<string | null>(null);
  const [measureValue, setMeasureValue] = useState('');
  const [measureAsk, setMeasureAsk] = useState<{
    measurement_type: string;
    unit: string;
    location: string;
  } | null>(null);
  const [diagnosisText, setDiagnosisText] = useState(t.summary);
  const [confidencePct, setConfidencePct] = useState(0);
  const [liveReport, setLiveReport] = useState<ReportItem | null>(null);
  const [savedCases, setSavedCases] = useState<InvestigationSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportPhase, setReportPhase] = useState<null | 'crafting' | 'exporting'>(null);
  const [liveCam, setLiveCam] = useState(false);
  const [livePreviewStream, setLivePreviewStream] = useState<MediaStream | null>(null);
  const [overlay, setOverlay] = useState<OverlayPayload | null>(null);
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const lastLiveContextRef = useRef('');

  const [messages, setMessages] = useState<BintuChatMessage[]>(() => [
    makeBotMessage(copy.fr.greet, { _id: 'greet', kind: 'info' }),
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && String(prev[0]._id) === 'greet') {
        return [makeBotMessage(t.greet, { _id: 'greet', kind: 'info' })];
      }
      return prev;
    });
  }, [t.greet]);

  const shellStyle = useMemo(
    () => [
      styles.shell,
      {
        width: phone,
        maxWidth: APP_MAX,
        alignSelf: 'center' as const,
        height: Platform.OS === 'web' ? Math.min(height, 900) : undefined,
        flex: 1,
        backgroundColor: colors.bg,
        overflow: 'hidden' as const,
      },
    ],
    [phone, height, colors.bg],
  );

  const pushBot = useCallback((partial: Partial<BintuChatMessage> & { text: string }) => {
    setMessages((m) => Chat.append(m, [makeBotMessage(partial.text, partial)]));
  }, []);

  const applySpatialGuide = useCallback(async (hint: string) => {
    if (wantsClearOverlay(hint)) return;
    const jpeg = lastJpegRef.current;
    if (!jpeg || overlayBusyRef.current) return;
    overlayBusyRef.current = true;
    try {
      const result = await requestVisionBoxes({
        image_base64: jpeg,
        hint,
        content_type: 'image/jpeg',
      });
      const items = (result.overlays || []) as Array<Record<string, unknown>>;
      if (items.length) {
        setOverlay((prev) =>
          overlayFromGemini(items as never, prev, { hint }),
        );
      }
    } catch {
      // Keep talking even if spatial annotate fails.
    } finally {
      overlayBusyRef.current = false;
    }
  }, []);

  const requestReportNowRef = useRef<(utterance: string) => void>(() => undefined);

  const handleLiveEvent = useCallback(
    (event: LiveServerEvent) => {
      if (event.type === 'error') {
        pushBot({ text: event.detail, kind: 'error' });
        return;
      }
      if (event.type === 'interrupted') {
        flushPlayback();
        return;
      }
      if (event.type === 'audio' && event.data) {
        playPcm16Base64(event.data, 24000);
        return;
      }
      if (event.type === 'user_transcript') {
        setVoiceCaption(event.text);
        if (wantsReport(event.text)) {
          requestReportNowRef.current(event.text);
          return;
        }
        // Effacer d’abord — ne pas redessiner juste après « retire le cadre ».
        if (wantsClearOverlay(event.text)) {
          setOverlay((prev) => overlayFromSpeech(event.text, prev));
          liveSessionRef.current?.sendText(
            `L’utilisateur a demandé d’effacer le guidage AR ("${event.text}"). Confirme brièvement à l’oral.`,
          );
          return;
        }
        setOverlay((prev) => overlayFromSpeech(event.text, prev));
        if (wantsSpatialGuide(event.text)) {
          void applySpatialGuide(event.text);
          liveSessionRef.current?.sendText(
            `L’utilisateur demande un guidage visuel: "${event.text}". Confirme à l’oral la cible et la forme (cadre, flèche, cercle).`,
          );
        }
        return;
      }
      if (event.type === 'assistant_transcript' || event.type === 'text') {
        setVoiceCaption(event.text);
        const parsed = extractOverlayJson(event.text);
        if (parsed) {
          setOverlay((prev) =>
            overlayFromGemini(parsed, prev, { hint: event.text }),
          );
        } else if (wantsClearOverlay(event.text)) {
          setOverlay((prev) => overlayFromSpeech(event.text, prev));
        } else if (wantsSpatialGuide(event.text)) {
          void applySpatialGuide(event.text);
        }
      }
    },
    [applySpatialGuide, pushBot],
  );

  const ensureLiveSession = useCallback(() => {
    if (liveSessionRef.current) return liveSessionRef.current;
    const session = openLiveSession({
      onEvent: handleLiveEvent,
      onError: (message) => pushBot({ text: message, kind: 'error' }),
      onClose: () => {
        if (liveSessionRef.current === session) liveSessionRef.current = null;
      },
    });
    liveSessionRef.current = session;
    return session;
  }, [handleLiveEvent, pushBot]);

  useEffect(() => {
    if (!liveCam) return;
    let cancelled = false;
    micStartedWithCamRef.current = false;
    const preset = pendingAvStreamRef.current;
    pendingAvStreamRef.current = null;
    if (preset) {
      sharedAvStreamRef.current?.getTracks().forEach((track) => track.stop());
      sharedAvStreamRef.current = preset;
    }
    const session = ensureLiveSession();
    void (async () => {
      try {
        // Brancher micro/caméra immédiatement (geste déjà consommé via preset).
        if (!micCaptureRef.current && isRealtimeVoiceSupported()) {
          setListening(true);
          setVoiceCaption(
            locale === 'fr'
              ? 'Caméra + micro Live — je vois et j’écoute…'
              : 'Live camera + mic — I see and listen…',
          );
          const capture = await startMicCapture(
            {
              onPcmBase64: (data) => {
                liveSessionRef.current?.sendAudioPcmBase64(data);
              },
              onError: (message) => Alert.alert('BINTU', message),
            },
            { stream: preset ?? undefined },
          );
          if (cancelled) {
            capture.stop();
            return;
          }
          micCaptureRef.current = capture;
          micStartedWithCamRef.current = true;
        }
        const vision = await startLiveVision(
          {
            onJpegBase64: (data) => {
              lastJpegRef.current = data;
              liveSessionRef.current?.sendVideoJpegBase64(data);
            },
            onError: (message) => Alert.alert('BINTU', message),
            onPreviewStream: (stream) => {
              if (!cancelled) setLivePreviewStream(stream);
            },
          },
          {
            cameraRef,
            facingMode: 'environment',
            stream: preset ?? undefined,
          },
        );
        if (cancelled) {
          vision.stop();
          return;
        }
        visionCaptureRef.current = vision;
        await session.ready;
      } catch (error) {
        if (!cancelled) {
          setLiveCam(false);
          setListening(false);
          setVoiceCaption('');
          micCaptureRef.current?.stop();
          micCaptureRef.current = null;
          sharedAvStreamRef.current?.getTracks().forEach((track) => track.stop());
          sharedAvStreamRef.current = null;
          notifyBintu(
            userFacingError(
              explainMediaError(error) || error,
              t.voiceMissing,
              locale,
            ),
          );
        } else {
          preset?.getTracks().forEach((track) => track.stop());
        }
      }
    })();
    return () => {
      cancelled = true;
      visionCaptureRef.current?.stop();
      visionCaptureRef.current = null;
      setLivePreviewStream(null);
      sharedAvStreamRef.current?.getTracks().forEach((track) => track.stop());
      sharedAvStreamRef.current = null;
      if (micStartedWithCamRef.current && micCaptureRef.current) {
        micCaptureRef.current.stop();
        micCaptureRef.current = null;
        micStartedWithCamRef.current = false;
        setListening(false);
        setVoiceCaption('');
      }
    };
  }, [ensureLiveSession, liveCam, locale, t.voiceMissing]);

  useEffect(() => {
    if (liveCam || listening) return;
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
  }, [liveCam, listening]);

  const pushLiveContext = useCallback((item: Investigation) => {
    const session = liveSessionRef.current;
    if (!session) return;
    const brief = memoryBrief(item);
    if (!brief || brief === lastLiveContextRef.current) return;
    lastLiveContextRef.current = brief;
    session.sendContext(brief);
  }, []);

  const hydrateCase = useCallback(
    (
      item: Investigation,
      options?: { present?: boolean; restoreMessages?: BintuChatMessage[] },
    ) => {
      const present = options?.present !== false;
      setCaseId(item.investigation_id);
      const pending = item.state.pending_action;
      setPendingTool(pending?.tool_name ?? null);
      pushLiveContext(item);
      if (options?.restoreMessages) {
        setMessages(options.restoreMessages);
      }

      const conclusion = item.state.conclusion;
      if (conclusion?.diagnosis) {
        const percent = Math.round((conclusion.confidence ?? 0) * 100);
        setDiagnosisText(conclusion.diagnosis);
        setConfidencePct(percent);
        setLiveReport({
          id: item.investigation_id,
          title: item.state.problem?.description ?? item.investigation_id,
          equipment: item.state.problem?.description ?? 'Équipement',
          date: new Date().toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US'),
          problem: item.state.problem?.description ?? '',
          cause: conclusion.diagnosis,
          solution: conclusion.diagnosis,
          confidence: percent,
          actions: [],
        });
        if (present) {
          pushBot({
            text: `${conclusion.diagnosis}\n\n${locale === 'fr' ? 'Confiance' : 'Confidence'} : ${percent}%`,
            reportCta: true,
            kind: 'diagnosis',
          });
        }
        setFlow({ name: options?.restoreMessages ? 'chat' : 'result' });
        return;
      }
      if (pending?.tool_name === 'request_measurement') {
        const measurement_type = String(pending.arguments.measurement_type ?? '');
        const unit = String(pending.arguments.unit ?? '');
        const location = String(pending.arguments.location ?? '');
        setMeasureAsk({ measurement_type, unit, location });
        setMeasureValue('');
        if (present) {
          pushBot({
            text:
              pending.reason ||
              `${locale === 'fr' ? 'Mesure demandée' : 'Measurement needed'}\n\n- ${measurement_type}\n- ${unit}\n- ${location}`,
            kind: 'measure',
          });
        }
        setFlow({ name: options?.restoreMessages ? 'chat' : 'measure' });
        return;
      }
      if (pending?.tool_name === 'analyze_image') {
        if (present) {
          pushBot({
            text: String(pending.arguments.focus || pending.reason || t.sampleBot),
            cameraCta: true,
            kind: 'image',
          });
          setOverlay(null);
          setLiveCam(true);
        }
        setFlow({ name: 'chat' });
        return;
      }
      if (pending?.tool_name === 'ask_technician') {
        if (present) {
          pushBot({
            text: String(pending.arguments.question || pending.reason || t.generic),
            kind: 'question',
          });
        }
        setFlow({ name: 'chat' });
        return;
      }
      if (present) {
        pushBot({
          text: String(
            pending?.arguments.comparison_reason || pending?.reason || t.generic,
          ),
          kind: 'info',
        });
      }
      setFlow({ name: 'chat' });
    },
    [locale, pushBot, pushLiveContext, t.generic, t.sampleBot],
  );

  const applyCase = useCallback(
    (item: Investigation) => hydrateCase(item, { present: true }),
    [hydrateCase],
  );

  const requestReportNow = useCallback(
    (utterance: string) => {
      if (!caseId || busy || reportPhase) return;
      setBusy(true);
      setReportPhase('crafting');
      setMessages((m) => Chat.append(m, [makeUserMessage(utterance)]));
      liveSessionRef.current?.sendText(
        locale === 'fr'
          ? 'L’utilisateur demande le rapport. Confirme brièvement : tu prépares le rapport d’intervention.'
          : 'The user asked for the report. Confirm briefly that you are preparing it.',
      );
      generateReport(caseId, utterance)
        .then(async (item) => {
          let presentation = null as Awaited<
            ReturnType<typeof getInvestigationReport>
          >['presentation'];
          try {
            presentation = (await getInvestigationReport(item.investigation_id))
              .presentation;
          } catch {
            presentation = undefined;
          }
          const base = reportFromInvestigation(item, locale);
          const cause = presentation?.cause || base?.cause || '';
          if (cause) {
            const report = {
              id: item.investigation_id,
              title:
                presentation?.equipment ||
                base?.title ||
                item.state.problem?.description ||
                item.investigation_id,
              equipment:
                presentation?.equipment ||
                base?.equipment ||
                'Équipement',
              date:
                base?.date ||
                new Date().toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US'),
              problem:
                presentation?.problem ||
                base?.problem ||
                item.state.problem?.description ||
                '',
              cause,
              solution: presentation?.solution || base?.solution || cause,
              confidence:
                presentation?.confidence_percent ??
                base?.confidence ??
                Math.round((item.state.conclusion?.confidence ?? 0) * 100),
              actions: presentation?.actions || base?.actions || [],
            };
            setLiveReport(report);
            setDiagnosisText(report.cause);
            setConfidencePct(report.confidence);
            pushBot({
              text:
                locale === 'fr'
                  ? `${report.cause}\n\nConfiance : ${report.confidence}%\n\nRapport prêt — ouvrez-le et exportez le PDF illustré.`
                  : `${report.cause}\n\nConfidence: ${report.confidence}%\n\nReport ready — open it and export the illustrated PDF.`,
              kind: 'diagnosis',
              reportCta: true,
            });
            setCaseId(item.investigation_id);
            setPendingTool(item.state.pending_action?.tool_name ?? null);
            setFlow({ name: 'report', id: report.id });
            return;
          }
          applyCase(item);
          pushBot({
            text:
              locale === 'fr'
                ? 'Impossible de conclure un diagnostic pour le rapport. Complétez encore quelques détails.'
                : 'Could not conclude a diagnosis for the report. Add a few more details.',
            kind: 'error',
          });
        })
        .catch((error: unknown) => {
          pushBot({
            text: userFacingError(error, t.generic, locale),
            kind: 'error',
          });
        })
        .finally(() => {
          setBusy(false);
          setReportPhase(null);
        });
    },
    [applyCase, busy, caseId, locale, pushBot, reportPhase, t.generic],
  );

  requestReportNowRef.current = requestReportNow;

  const openChat = useCallback(() => {
    setCaseId(null);
    setLiveCam(false);
    setOverlay(null);
    setMessages([makeBotMessage(t.greet, { _id: 'greet', kind: 'info' })]);
    setFlow({ name: 'chat' });
  }, [t.greet]);

  const sendText = useCallback(
    (value: string) => {
      const text = value.trim();
      if (!text || busy) return;
      setDraft('');
      // Demande de rapport (texte ou Live) → conclure + PDF.
      if (caseId && wantsReport(text)) {
        requestReportNow(text);
        return;
      }
      setMessages((m) => Chat.append(m, [makeUserMessage(text)]));
      setBusy(true);
      const waitSpace = Boolean(caseId && (listening || liveCam));
      if (waitSpace && caseId) {
        // Live / caméra : rester en attente — mémoire légère, pas de decide_next.
        liveSessionRef.current?.sendText(text);
        sendMessage(caseId, text, { commit: false })
          .then((item) => {
            setCaseId(item.investigation_id);
            setPendingTool(item.state.pending_action?.tool_name ?? null);
            pushLiveContext(item);
            pushBot({
              text:
                locale === 'fr'
                  ? 'Noté dans l’échange en cours.'
                  : 'Noted in the live exchange.',
              kind: 'info',
            });
          })
          .catch((error: unknown) => {
            pushBot({
              text: userFacingError(error, t.generic, locale),
              kind: 'error',
            });
          })
          .finally(() => setBusy(false));
        return;
      }
      const request = caseId
        ? sendMessage(caseId, text, { commit: true })
        : createInvestigation(text);
      request
        .then((item) => applyCase(item))
        .catch((error: unknown) => {
          pushBot({
            text: userFacingError(error, t.generic, locale),
            kind: 'error',
          });
        })
        .finally(() => setBusy(false));
    },
    [
      applyCase,
      busy,
      caseId,
      listening,
      liveCam,
      locale,
      pushBot,
      pushLiveContext,
      requestReportNow,
      t.generic,
    ],
  );

  const stopVoice = useCallback(() => {
    micCaptureRef.current?.stop();
    micCaptureRef.current = null;
    flushPlayback();
    setListening(false);
    setVoiceCaption('');
    // Session kept if camera still live.
    if (!liveCam) {
      liveSessionRef.current?.close();
      liveSessionRef.current = null;
    }
  }, [liveCam]);

  const mediaFail = useCallback(
    (error: unknown, fallback: string) => {
      const text = explainMediaError(error) || fallback;
      notifyBintu(text, {
        onWebChat: (msg) => pushBot({ text: msg, kind: 'error' }),
      });
    },
    [pushBot],
  );

  const toggleVoice = useCallback(async () => {
    if (listening) {
      stopVoice();
      return;
    }
    // Expo native: duplex mic/speaker via the backend Live page (same Gemini Live stack).
    if (Platform.OS !== 'web') {
      try {
        const { openBrowserAsync } = await import('expo-web-browser');
        await openBrowserAsync(`${apiOrigin()}/live-test`);
      } catch (error) {
        mediaFail(error, t.voiceMissing);
      }
      return;
    }
    if (!isRealtimeVoiceSupported()) {
      mediaFail(null, t.voiceMissing);
      return;
    }
    // Sur http://IP : tenter quand même (certains Chrome), sinon message HTTPS clair.
    let micStream: MediaStream | null = null;
    try {
      // IMPORTANT: getUserMedia dans le geste utilisateur, avant await WebSocket.
      micStream = await acquireMicStream();
      const session = ensureLiveSession();
      setListening(true);
      setVoiceCaption(
        locale === 'fr' ? 'Parlez — BINTU répond à l’oral…' : 'Speak — BINTU answers out loud…',
      );
      const capture = await startMicCapture(
        {
          onPcmBase64: (data) => {
            liveSessionRef.current?.sendAudioPcmBase64(data);
          },
          onError: (message) => {
            mediaFail(message, message);
            stopVoice();
          },
        },
        { stream: micStream },
      );
      micCaptureRef.current = capture;
      micStream = null; // owned by capture stop()
      void session.ready.catch((error: unknown) => {
        mediaFail(error, t.voiceMissing);
        stopVoice();
      });
    } catch (error) {
      micStream?.getTracks().forEach((track) => track.stop());
      micCaptureRef.current?.stop();
      micCaptureRef.current = null;
      flushPlayback();
      setListening(false);
      setVoiceCaption('');
      if (!liveCam) {
        liveSessionRef.current?.close();
        liveSessionRef.current = null;
      }
      mediaFail(error, t.voiceMissing);
    }
  }, [
    ensureLiveSession,
    listening,
    liveCam,
    locale,
    mediaFail,
    stopVoice,
    t.voiceMissing,
  ]);

  const openCamera = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        // getUserMedia synchrone au tap — sinon Chrome refuse après await.
        const stream = await acquireLiveAvStream('environment');
        pendingAvStreamRef.current?.getTracks().forEach((track) => track.stop());
        pendingAvStreamRef.current = stream;
        setLivePreviewStream(stream);
      } catch (error) {
        mediaFail(error, t.cameraDenied);
        return;
      }
    } else if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        mediaFail(null, t.cameraDenied);
        return;
      }
    }
    setOverlay(null); // Caméra Live : aucun texte / cadre au démarrage
    setLiveCam(true);
    setListening(true);
    setFlow({ name: 'chat' });
  }, [mediaFail, permission, requestPermission, t.cameraDenied]);

  const finishMeasure = useCallback(
    (accepted: boolean) => {
      if (!accepted) {
        setFlow({ name: 'chat' });
        pushBot({ text: t.ignored });
        return;
      }
      const numeric = Number(measureValue.replace(',', '.'));
      if (!caseId || !measureAsk || !Number.isFinite(numeric)) {
        Alert.alert('BINTU', locale === 'fr' ? 'Saisissez la valeur demandée.' : 'Enter the requested value.');
        return;
      }
      setBusy(true);
      submitMeasurement(caseId, {
        measurement_type: measureAsk.measurement_type,
        value: numeric,
        unit: measureAsk.unit,
        location: measureAsk.location,
      })
        .then((item) => {
          pushBot({ text: `${numeric} ${measureAsk.unit} — ${measureAsk.location}` });
          applyCase(item);
        })
        .catch((error: unknown) => {
          notifyBintu(userFacingError(error, t.generic, locale));
        })
        .finally(() => setBusy(false));
    },
    [applyCase, caseId, locale, measureAsk, measureValue, pushBot, t.generic, t.ignored],
  );

  const capturePhoto = useCallback(async () => {
    if (!caseId) {
      Alert.alert('BINTU', locale === 'fr' ? 'Décrivez d’abord le problème.' : 'Describe the problem first.');
      return;
    }
    const camera = cameraRef.current;
    if (!camera || busy) return;
    // En Live / attente hors analyze_image : le flux JPEG part déjà vers Gemini Live.
    if (liveCam && pendingTool !== 'analyze_image') {
      pushBot({
        text:
          locale === 'fr'
            ? 'La caméra reste dans l’échange Live — pas de nouvel appel diagnostic.'
            : 'Camera stays in the Live exchange — no new diagnostic call.',
        kind: 'info',
      });
      return;
    }
    setBusy(true);
    try {
      const photo = await camera.takePictureAsync({ quality: 0.5 });
      if (!photo?.uri) throw new Error('Photo indisponible');
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(photo.uri)).blob();
        form.append('image', blob, 'capture.jpg');
      } else {
        form.append('image', {
          uri: photo.uri,
          name: 'capture.jpg',
          type: 'image/jpeg',
        } as unknown as Blob);
      }
      const item = await uploadImage(caseId, form);
      setLiveCam(false);
      applyCase(item);
    } catch (error) {
      notifyBintu(userFacingError(error, t.generic, locale));
      setFlow({ name: 'chat' });
    } finally {
      setBusy(false);
    }
  }, [applyCase, busy, caseId, liveCam, locale, pendingTool, pushBot, t.generic]);

  const openSaved = useCallback(
    (id: string) => {
      setBusy(true);
      setLiveCam(false);
      setOverlay(null);
      setListening(false);
      Promise.all([
        getInvestigation(id),
        getConversation(id).catch(() => ({ investigation_id: id, turns: [] })),
      ])
        .then(([item, conversation]) => {
          const restored =
            conversation.turns.length > 0
              ? messagesFromTurns(conversation.turns, t.greet)
              : messagesFromInvestigation(item, t.greet);
          hydrateCase(item, {
            present: false,
            restoreMessages: restored,
          });
          const report = reportFromInvestigation(item, locale);
          if (report) setLiveReport(report);
        })
        .catch((error: unknown) => {
          notifyBintu(userFacingError(error, t.generic, locale));
        })
        .finally(() => setBusy(false));
    },
    [hydrateCase, locale, t.generic, t.greet],
  );

  /** Onglet Rapports : ouvre le rapport PDF-ready uniquement si diagnostiqué. */
  const openReport = useCallback(
    (id: string) => {
      setBusy(true);
      Promise.all([getInvestigation(id), getInvestigationReport(id)])
        .then(([item, reportPayload]) => {
          const base = reportFromInvestigation(item, locale);
          const presentation = reportPayload.presentation;
          if (!base && !presentation?.cause) {
            notifyBintu(
              locale === 'fr'
                ? 'Aucun rapport : ce diagnostic n’a pas de conclusion.'
                : 'No report: this diagnostic has no conclusion.',
            );
            return;
          }
          const report = {
            id: item.investigation_id,
            title:
              presentation?.equipment ||
              base?.title ||
              item.state.problem?.description ||
              item.investigation_id,
            equipment:
              presentation?.equipment ||
              base?.equipment ||
              item.state.problem?.description ||
              'Équipement',
            date:
              base?.date ||
              new Date().toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US'),
            problem:
              presentation?.problem ||
              base?.problem ||
              item.state.problem?.description ||
              '',
            cause: presentation?.cause || base?.cause || '',
            solution: presentation?.solution || base?.solution || presentation?.cause || '',
            confidence:
              presentation?.confidence_percent ??
              base?.confidence ??
              Math.round((item.state.conclusion?.confidence ?? 0) * 100),
            actions: presentation?.actions || base?.actions || [],
          };
          if (!report.cause.trim()) {
            notifyBintu(
              locale === 'fr'
                ? 'Aucun rapport : ce diagnostic n’a pas de conclusion.'
                : 'No report: this diagnostic has no conclusion.',
            );
            return;
          }
          setLiveReport(report);
          setDiagnosisText(report.cause);
          setConfidencePct(report.confidence);
          setCaseId(item.investigation_id);
          setFlow({ name: 'report', id: report.id });
        })
        .catch((error: unknown) => {
          notifyBintu(userFacingError(error, t.generic, locale));
        })
        .finally(() => setBusy(false));
    },
    [locale, t.generic],
  );

  const refreshHistory = useCallback(() => {
    setSavedCases(null);
    listInvestigations()
      .then((items) => setSavedCases(items))
      .catch(() => setSavedCases([]));
  }, []);

  useEffect(() => {
    if (flow.name !== 'tabs' || (tab !== 'history' && tab !== 'reports')) return;
    let cancelled = false;
    listInvestigations()
      .then((items) => {
        if (!cancelled) setSavedCases(items);
      })
      .catch(() => {
        if (!cancelled) setSavedCases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [flow.name, tab]);

  const formatHistoryDate = useCallback(
    (raw: string) => {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;
      return date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [locale],
  );

  const activeReport =
    flow.name === 'report'
      ? liveReport && liveReport.id === flow.id
        ? liveReport
        : null
      : null;

  const exportReport = (report: ReportItem) => {
    if (!report.cause?.trim()) {
      notifyBintu(
        locale === 'fr'
          ? 'Aucun rapport PDF : diagnostic non conclu.'
          : 'No PDF report: diagnosis not concluded.',
      );
      return;
    }
    if (reportPhase) return;
    setReportPhase('exporting');
    void (async () => {
      try {
        const blob = await downloadReportPdf(report.id);
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `bintu-${report.id}.pdf`;
          link.click();
          URL.revokeObjectURL(url);
        }
        notifyBintu(t.pdfReady);
      } catch (error) {
        notifyBintu(userFacingError(error, t.generic, locale));
      } finally {
        setReportPhase(null);
      }
    })();
  };

  const renderHome = () => (
    <View style={styles.homeFill}>
      <ImageBackground
        source={require('../assets/welcome-bintu.jpg')}
        style={styles.homeHero}
        imageStyle={styles.homeHeroImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={
            mode === 'dark'
              ? ['rgba(2,8,15,0.35)', 'rgba(2,8,15,0.92)']
              : ['rgba(217,228,247,0.25)', 'rgba(217,228,247,0.94)']
          }
          style={styles.homeHeroScrim}
        >
          <TopBar
            colors={colors}
            left={
              <Pressable onPress={() => setTab('more')} hitSlop={12}>
                <Menu size={22} color={colors.text} />
              </Pressable>
            }
            right={
              <Pressable onPress={() => setFlow({ name: 'notifications' })} hitSlop={12}>
                <Bell size={22} color={colors.text} />
                {notifOn && <View style={[styles.notifDot, { backgroundColor: '#F04452' }]} />}
              </Pressable>
            }
          />
          <View style={styles.homeBody}>
            <BrandMark size={96} />
            <Text style={[styles.brand, { color: colors.text }]}>BINTU</Text>
            <Text style={[styles.tagline, { color: colors.muted }]}>{t.brandSub}</Text>
            <PillButton label={t.start} onPress={openChat} colors={colors} />
            <Pressable onPress={toggleVoice} style={styles.voiceBlock}>
              <View
                style={[
                  styles.micRing,
                  { borderColor: listening ? colors.green : colors.blue },
                ]}
              >
                <Mic size={26} color={listening ? colors.green : colors.blue} />
              </View>
              <Text style={[styles.readyTitle, { color: colors.text }]}>
                {listening ? t.voiceLiveTitle : t.readyTitle}
              </Text>
              <Text style={[styles.readyBody, { color: colors.muted }]}>
                {listening ? voiceCaption || t.voiceLiveBody : t.readyBody}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );

  const renderHistory = () => (
    <View style={styles.pageFill}>
      <TopBar
        colors={colors}
        center={<Text style={[styles.pageTitle, { color: colors.text }]}>{t.history}</Text>}
        right={
          <Pressable onPress={refreshHistory} hitSlop={12}>
            <Text style={{ color: colors.blue, fontWeight: '700', fontSize: 13 }}>
              {locale === 'fr' ? 'Actualiser' : 'Refresh'}
            </Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.listPad} showsVerticalScrollIndicator={false}>
        {savedCases === null ? (
          <Text style={[styles.listMeta, { color: colors.muted }]}>
            {locale === 'fr' ? 'Chargement de l’historique…' : 'Loading history…'}
          </Text>
        ) : null}
        {savedCases !== null && savedCases.length === 0 ? (
          <Text style={[styles.listMeta, { color: colors.muted }]}>
            {locale === 'fr'
              ? 'Aucun diagnostic enregistré. Lancez une enquête pour la retrouver ici.'
              : 'No saved diagnostics yet. Start an inquiry to see it here.'}
          </Text>
        ) : null}
        {(savedCases ?? []).map((item) => {
          const tone =
            item.status === 'completed'
              ? colors.green
              : item.status === 'waiting_for_technician'
                ? colors.orange
                : colors.blue;
          const status =
            item.status === 'completed'
              ? locale === 'fr'
                ? 'Confirmé'
                : 'Confirmed'
              : item.status === 'insufficient_information'
                ? locale === 'fr'
                  ? 'Incomplet'
                  : 'Incomplete'
                : item.status === 'waiting_for_technician'
                  ? locale === 'fr'
                    ? 'En attente'
                    : 'Waiting'
                  : locale === 'fr'
                    ? 'En cours'
                    : 'In progress';
          return (
            <Pressable
              key={item.investigation_id}
              onPress={() => openSaved(item.investigation_id)}
              style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.listIcon, { backgroundColor: tone + '18' }]}>
                <Clock3 size={18} color={tone} />
              </View>
              <View style={styles.listBody}>
                <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={2}>
                  {item.problem || (locale === 'fr' ? 'Diagnostic sans titre' : 'Untitled diagnostic')}
                </Text>
                <Text style={[styles.listMeta, { color: colors.muted }]}>
                  {formatHistoryDate(item.updated_at)}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: tone + '18' }]}>
                <Text style={[styles.statusText, { color: tone }]}>{status}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const reportCases = (savedCases ?? []).filter(
    (item) =>
      item.has_report === true ||
      (item.status === 'completed' && Boolean(item.diagnosis?.trim())),
  );

  const renderReports = () => (
    <View style={styles.pageFill}>
      <TopBar colors={colors} center={<Text style={[styles.pageTitle, { color: colors.text }]}>{t.reports}</Text>} />
      <ScrollView contentContainerStyle={styles.listPad} showsVerticalScrollIndicator={false}>
        {savedCases === null ? (
          <Text style={[styles.listMeta, { color: colors.muted }]}>
            {locale === 'fr' ? 'Chargement des rapports…' : 'Loading reports…'}
          </Text>
        ) : null}
        {savedCases !== null && reportCases.length === 0 ? (
          <Text style={[styles.listMeta, { color: colors.muted }]}>
            {locale === 'fr'
              ? 'Aucun rapport. Un PDF n’est créé qu’après un diagnostic conclu.'
              : 'No reports. A PDF is created only after a concluded diagnosis.'}
          </Text>
        ) : null}
        {reportCases.map((item) => (
          <Pressable
            key={item.investigation_id}
            onPress={() => openReport(item.investigation_id)}
            style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.listIcon, { backgroundColor: colors.blueSoft }]}>
              <FileText size={18} color={colors.blue} />
            </View>
            <View style={styles.listBody}>
              <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
                {item.problem || item.investigation_id}
              </Text>
              <Text style={[styles.listMeta, { color: colors.muted }]} numberOfLines={2}>
                {item.diagnosis || formatHistoryDate(item.updated_at)}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const renderSettings = () => (
    <View style={styles.pageFill}>
      <TopBar colors={colors} center={<Text style={[styles.pageTitle, { color: colors.text }]}>{t.settings}</Text>} />
      <ScrollView contentContainerStyle={styles.listPad} showsVerticalScrollIndicator={false}>
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient colors={['#1769FF', '#4EC6FF']} style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name || user?.email || t.techName).slice(0, 2).toUpperCase()}
            </Text>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
              {user?.name || t.techName}
            </Text>
            <Text style={[styles.listMeta, { color: colors.muted }]} numberOfLines={1}>
              {user?.email || t.techEmail}
            </Text>
            {quota && quota.period_date !== 'local' ? (
              <Text style={[styles.listMeta, { color: colors.muted, marginTop: 4 }]}>
                Free · {quota.messages_remaining}/{quota.messages_limit} msg ·{' '}
                {Math.floor(quota.live_minutes_remaining)} min live ·{' '}
                {quota.investigations_remaining} diag
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              {mode === 'dark' ? <Moon size={18} color={colors.blue} /> : <Sun size={18} color={colors.orange} />}
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t.theme}</Text>
            </View>
            <Switch
              value={mode === 'dark'}
              onValueChange={(v: boolean) => setMode(v ? 'dark' : 'light')}
              trackColor={{ false: colors.border, true: colors.blue }}
            />
          </View>
          <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
          <Pressable
            style={styles.settingRow}
            onPress={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
          >
            <View style={styles.settingLeft}>
              <Text style={[styles.langBadge, { color: colors.blue, backgroundColor: colors.blueSoft }]}>Aa</Text>
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t.language}</Text>
            </View>
            <Text style={[styles.settingValue, { color: colors.muted }]}>
              {locale === 'fr' ? t.french : t.english}
            </Text>
          </Pressable>
          <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.settingRow} onPress={() => setFlow({ name: 'notifications' })}>
            <View style={styles.settingLeft}>
              <Bell size={18} color={colors.blue} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t.notifications}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.settingRow} onPress={() => setTab('history')}>
            <View style={styles.settingLeft}>
              <Clock3 size={18} color={colors.blue} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t.history}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.settingRow} onPress={() => setFlow({ name: 'about' })}>
            <View style={styles.settingLeft}>
              <Info size={18} color={colors.blue} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t.about}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.settingRow} onPress={() => setFlow({ name: 'help' })}>
            <View style={styles.settingLeft}>
              <HelpCircle size={18} color={colors.blue} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>{t.help}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
          <Pressable
            style={styles.settingRow}
            onPress={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            <View style={styles.settingLeft}>
              <LogOut size={18} color="#C62828" />
              <Text style={[styles.settingLabel, { color: '#C62828' }]}>
                {locale === 'fr' ? 'Quitter la session' : 'Sign out'}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );

  const insecureWebMedia =
    Platform.OS === 'web' && !isSecureMediaContext();
  const httpsMediaUrl = suggestedHttpsUrl();

  const renderChat = () => (
    <DiagnosticChat
      messages={messages}
      colors={colors}
      dark={mode === 'dark'}
      locale={locale}
      busy={busy}
      draft={draft}
      listening={listening}
      voiceCaption={voiceCaption}
      liveCam={liveCam}
      placeholder={t.placeholder}
      shareCameraLabel={t.shareCamera}
      seeReportLabel={t.seeReport}
      onChangeDraft={setDraft}
      onSendText={sendText}
      onToggleVoice={toggleVoice}
      onOpenCamera={openCamera}
      onSeeReport={() => liveReport && setFlow({ name: 'report', id: liveReport.id })}
      header={
        <View>
          <TopBar
            colors={colors}
            left={
              <Pressable onPress={() => setFlow({ name: 'tabs' })} hitSlop={12}>
                <ChevronLeft size={24} color={colors.text} />
              </Pressable>
            }
            center={
              <View style={styles.chatHeader}>
                <BrandMark size={28} />
                <View>
                  <Text style={[styles.chatBrand, { color: colors.text }]}>BINTU</Text>
                  <View style={styles.onlineRow}>
                    <View style={[styles.onlineDot, { backgroundColor: colors.green }]} />
                    <Text style={[styles.onlineText, { color: colors.green }]}>{t.online}</Text>
                  </View>
                </View>
              </View>
            }
          />
          {insecureWebMedia ? (
            <Pressable
              onPress={() => {
                if (httpsMediaUrl && typeof window !== 'undefined') {
                  window.location.assign(httpsMediaUrl);
                }
              }}
              style={{
                marginHorizontal: 12,
                marginBottom: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: '#FFF4E5',
                borderWidth: 1,
                borderColor: '#F5A524',
              }}
            >
              <Text style={{ color: '#7A4D00', fontSize: 13, lineHeight: 18, fontWeight: '600' }}>
                Chrome bloque micro/caméra sur HTTP (IP LAN).
              </Text>
              <Text style={{ color: '#7A4D00', fontSize: 12, lineHeight: 17, marginTop: 4 }}>
                {httpsMediaUrl
                  ? `1) npm run dev:https dans phone/  →  2) ouvrez ${httpsMediaUrl} (accepter le certificat)`
                  : 'Lancez npm run dev:https puis ouvrez https://VOTRE-IP:8443'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
      footer={
        liveCam ? (
          <View style={styles.liveCamWrap}>
            <ArLiveCard
              cameraRef={cameraRef}
              permissionGranted={!!permission?.granted}
              overlay={overlay}
              silentLive
              previewStream={livePreviewStream}
              onClose={() => {
                visionCaptureRef.current?.stop();
                visionCaptureRef.current = null;
                micCaptureRef.current?.stop();
                micCaptureRef.current = null;
                micStartedWithCamRef.current = false;
                sharedAvStreamRef.current?.getTracks().forEach((track) => track.stop());
                sharedAvStreamRef.current = null;
                flushPlayback();
                setLivePreviewStream(null);
                setListening(false);
                setLiveCam(false);
                setVoiceCaption('');
                setOverlay(null);
              }}
              onCapture={capturePhoto}
              onAskPermission={() => {
                void requestPermission();
              }}
              allowLabel={t.allowCamera}
            />
          </View>
        ) : null
      }
    />
  );

  const renderCamera = () => (
    <View style={styles.cameraFill}>
      <ArLiveCard
        cameraRef={cameraRef}
        permissionGranted={!!permission?.granted}
        overlay={overlay}
        onClose={() => setFlow({ name: 'chat' })}
        onCapture={capturePhoto}
        onAskPermission={() => {
          void requestPermission();
        }}
        allowLabel={t.allowCamera}
      />
    </View>
  );

  const renderMeasure = () => (
    <View style={[styles.pageFill, { backgroundColor: colors.bg }]}>
      <TopBar
        colors={colors}
        left={
          <Pressable onPress={() => setFlow({ name: 'camera' })} hitSlop={12}>
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
        }
        center={<Text style={[styles.pageTitle, { color: colors.text }]}>{t.measureTitle}</Text>}
      />
      <View style={styles.measureBody}>
        <Text style={[styles.measureHelp, { color: colors.muted }]}>
          {measureAsk
            ? `${measureAsk.measurement_type} — ${measureAsk.location}`
            : t.measureHelp}
        </Text>
        <View style={[styles.measureCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            value={measureValue}
            onChangeText={setMeasureValue}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            style={[styles.measureValue, { color: colors.text }]}
          />
          <Text style={[styles.measureHelp, { color: colors.muted }]}>{measureAsk?.unit ?? ''}</Text>
        </View>
        <Text style={[styles.confidenceLabel, { color: colors.muted }]}>{t.confidenceIndex}</Text>
        <View style={[styles.confidenceTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.confidenceFill, { width: '92%', backgroundColor: colors.green }]} />
        </View>
        <View style={styles.measureActions}>
          <PillButton label={t.validate} onPress={() => finishMeasure(true)} colors={colors} />
          <PillButton label={t.ignore} onPress={() => finishMeasure(false)} colors={colors} ghost />
        </View>
      </View>
    </View>
  );

  const renderResult = () => (
    <View style={[styles.resultFill, { backgroundColor: '#071426' }]}>
      <Pressable
        onPress={() => liveReport && setFlow({ name: 'report', id: liveReport.id })}
        style={styles.resultClose}
      >
        <X size={22} color="#fff" />
      </Pressable>
      <View style={styles.resultBody}>
        <View style={styles.checkCircle}>
          <Check size={42} color="#fff" strokeWidth={3} />
        </View>
        <Text style={styles.resultTitle}>{t.confirmed}</Text>
        <Text style={styles.resultSummary}>{diagnosisText}</Text>
        <Text style={styles.resultActionsTitle}>{t.actionsTitle}</Text>
        {[t.action1, t.action2, t.action3].map((action) => (
          <View key={action} style={styles.actionRow}>
            <View style={styles.actionCheck}>
              <Check size={12} color="#16C784" />
            </View>
            <Text style={styles.actionText}>{action}</Text>
          </View>
        ))}
        <Text style={styles.confPct}>{t.confidence} {confidencePct}%</Text>
        <View style={styles.confBarDark}>
          <View style={[styles.confBarFill, { width: `${Math.max(0, Math.min(100, confidencePct))}%` }]} />
        </View>
        <PillButton
          label={t.seeReport}
          onPress={() => liveReport && setFlow({ name: 'report', id: liveReport.id })}
          colors={dark}
        />
      </View>
    </View>
  );

  const renderReportDetail = (report: ReportItem) => (
    <View style={styles.pageFill}>
      <TopBar
        colors={colors}
        left={
          <Pressable
            onPress={() => {
              setFlow({ name: 'tabs' });
              setTab('reports');
            }}
            hitSlop={12}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
        }
        center={<Text style={[styles.pageTitle, { color: colors.text }]}>{t.reportTitle}</Text>}
      />
      <ScrollView contentContainerStyle={styles.listPad} showsVerticalScrollIndicator={false}>
        <Text style={[styles.detailsTitle, { color: colors.text }]}>{t.details}</Text>
        {(
          [
            [t.dateLabel, report.date],
            [t.equipmentLabel, report.equipment],
            [t.problemLabel, report.problem],
            [t.causeLabel, report.cause],
            [t.solutionLabel, report.solution],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
          </View>
        ))}
        {report.actions?.length ? (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.detailsTitle, { color: colors.text }]}>{t.actionsTitle}</Text>
            {report.actions.map((action) => (
              <Text
                key={action}
                style={[styles.detailValue, { color: colors.text, marginBottom: 6 }]}
              >
                • {action}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={{ height: 18 }} />
        <PillButton
          label={reportPhase === 'exporting' ? (locale === 'fr' ? 'Composition du PDF…' : 'Building PDF…') : t.exportPdf}
          onPress={() => exportReport(report)}
          colors={colors}
        />
        <View style={{ height: 10 }} />
        <PillButton
          label={t.share}
          onPress={() => Alert.alert('BINTU', t.shared)}
          colors={colors}
          ghost
          icon={<Share2 size={16} color={colors.text} />}
        />
      </ScrollView>
    </View>
  );

  const renderSimple = (title: string, body: ReactNode) => (
    <View style={styles.pageFill}>
      <TopBar
        colors={colors}
        left={
          <Pressable onPress={() => setFlow({ name: 'tabs' })} hitSlop={12}>
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
        }
        center={<Text style={[styles.pageTitle, { color: colors.text }]}>{title}</Text>}
      />
      <ScrollView contentContainerStyle={styles.listPad} showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
    </View>
  );

  let content: ReactNode = null;

  if (flow.name === 'chat') content = renderChat();
  else if (flow.name === 'camera') content = renderCamera();
  else if (flow.name === 'measure') content = renderMeasure();
  else if (flow.name === 'result') content = renderResult();
  else if (flow.name === 'report' && activeReport) content = renderReportDetail(activeReport);
  else if (flow.name === 'about') {
    content = renderSimple(
      t.about,
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <BrandMark size={72} />
        <Text style={[styles.infoLead, { color: colors.text }]}>{t.aboutLead}</Text>
        <Text style={[styles.infoBody, { color: colors.muted }]}>{t.aboutBody}</Text>
      </View>,
    );
  } else if (flow.name === 'help') {
    content = renderSimple(
      t.help,
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.infoLead, { color: colors.text }]}>{t.helpLead}</Text>
        {[t.help1, t.help2, t.help3].map((line, i) => (
          <Text key={line} style={[styles.helpLine, { color: colors.muted }]}>
            {i + 1}. {line}
          </Text>
        ))}
        <Text style={[styles.helpMail, { color: colors.blue }]}>{t.helpMail}</Text>
      </View>,
    );
  } else if (flow.name === 'notifications') {
    content = renderSimple(
      t.notifications,
      <View style={[styles.settingsGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>{t.notifications}</Text>
          <Switch
            value={notifOn}
            onValueChange={setNotifOn}
            trackColor={{ false: colors.border, true: colors.blue }}
          />
        </View>
        <Text style={[styles.listMeta, { color: colors.muted, padding: 16 }]}>
          {notifOn
            ? locale === 'fr'
              ? 'Aucune notification pour le moment.'
              : 'No notifications yet.'
            : t.notifOff}
        </Text>
      </View>,
    );
  } else {
    content =
      tab === 'home'
        ? renderHome()
        : tab === 'history'
          ? renderHistory()
          : tab === 'reports'
            ? renderReports()
            : renderSettings();
  }

  const showTabs = flow.name === 'tabs';

  return (
    <View style={[styles.root, { backgroundColor: mode === 'dark' ? '#02080F' : '#D9E4F7' }]}>
      <SafeAreaView style={shellStyle}>
        <View style={styles.content}>{content}</View>
        {showTabs && (
          <View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            {(
              [
                { key: 'home' as TabKey, label: t.home, Icon: Home },
                { key: 'history' as TabKey, label: t.history, Icon: Clock3 },
                { key: 'reports' as TabKey, label: t.reports, Icon: FileText },
                { key: 'more' as TabKey, label: t.more, Icon: Menu },
              ] as const
            ).map(({ key, label, Icon }) => {
              const active = tab === key;
              return (
                <Pressable key={key} onPress={() => setTab(key)} style={styles.bottomItem}>
                  <Icon size={20} color={active ? colors.blue : colors.muted} />
                  <Text style={[styles.bottomLabel, { color: active ? colors.blue : colors.muted }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </SafeAreaView>
      {reportPhase ? (
        <ReportCraftOverlay mode={reportPhase} locale={locale} />
      ) : null}
    </View>
  );
}

function ReportCraftOverlay({
  mode,
  locale,
}: {
  mode: 'crafting' | 'exporting';
  locale: Locale;
}) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 900, useNativeDriver: true }),
      ]),
    );
    const barLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bar, { toValue: 1, duration: 2200, useNativeDriver: false }),
        Animated.timing(bar, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    pulseLoop.start();
    barLoop.start();
    return () => {
      pulseLoop.stop();
      barLoop.stop();
    };
  }, [bar, pulse]);

  const width = bar.interpolate({
    inputRange: [0, 1],
    outputRange: ['8%', '92%'],
  });

  const fr = locale === 'fr';
  const title =
    mode === 'crafting'
      ? fr
        ? 'Génération du rapport…'
        : 'Crafting your report…'
      : fr
        ? 'Composition du PDF illustré…'
        : 'Building illustrated PDF…';
  const steps =
    mode === 'crafting'
      ? fr
        ? ['Synthèse du diagnostic', 'Illustrations Muse Image', 'Mise en page PDF']
        : ['Diagnosing summary', 'Muse Image illustrations', 'PDF layout']
      : fr
        ? ['Structure éditoriale', 'Insertion des figures', 'Téléchargement']
        : ['Editorial layout', 'Embedding figures', 'Download'];

  return (
    <View style={styles.craftOverlay} pointerEvents="auto">
      <Animated.View style={[styles.craftCard, { opacity: pulse }]}>
        <View style={styles.craftIconWrap}>
          <FileText size={28} color="#1769FF" />
        </View>
        <Text style={styles.craftTitle}>{title}</Text>
        <View style={styles.craftBarTrack}>
          <Animated.View style={[styles.craftBarFill, { width }]} />
        </View>
        {steps.map((step, index) => (
          <Text key={step} style={styles.craftStep}>
            {index + 1}. {step}
          </Text>
        ))}
        <ActivityIndicator color="#1769FF" style={{ marginTop: 14 }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden',
  },
  shell: {
    borderRadius: Platform.OS === 'web' ? 28 : 0,
    overflow: 'hidden',
  },
  content: { flex: 1, overflow: 'hidden' },
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topSide: { width: 44, alignItems: 'flex-start' },
  topSideRight: { alignItems: 'flex-end' },
  topCenter: { flex: 1, alignItems: 'center' },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  homeFill: { flex: 1 },
  homeHero: { flex: 1 },
  homeHeroImage: { opacity: 0.55 },
  homeHeroScrim: { flex: 1 },
  homeBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
    paddingBottom: 24,
  },
  brand: { fontSize: 34, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  tagline: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  pill: {
    minHeight: 52,
    borderRadius: 28,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  pillText: { fontSize: 15, fontWeight: '800' },
  voiceBlock: { alignItems: 'center', marginTop: 18, gap: 8 },
  micRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyTitle: { fontSize: 15, fontWeight: '700' },
  readyBody: { fontSize: 13, textAlign: 'center' },
  notifDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pageFill: { flex: 1 },
  pageTitle: { fontSize: 16, fontWeight: '800' },
  listPad: { padding: 16, paddingBottom: 28, gap: 10 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBody: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 13, fontWeight: '700' },
  listMeta: { fontSize: 11, marginTop: 3 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800' },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800' },
  settingsGroup: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  settingRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  settingLabel: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  settingValue: { fontSize: 13, fontWeight: '600' },
  settingDivider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  langBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    lineHeight: 28,
  },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatBrand: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 11, fontWeight: '700' },
  chatScroll: { flex: 1 },
  chatPad: { padding: 16, gap: 12, paddingBottom: 24 },
  bubbleWrap: { maxWidth: '88%', gap: 8 },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 20, padding: 14, overflow: 'hidden' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  inlineMedia: { marginBottom: 10, borderRadius: 14, overflow: 'hidden' },
  cameraCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cameraCtaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerMic: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveCamWrap: {
    marginTop: 8,
    marginBottom: 12,
  },
  liveCamHint: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  cameraFill: { flex: 1, backgroundColor: '#000', padding: 12, justifyContent: 'center' },
  allowCam: {
    alignSelf: 'center',
    marginBottom: 16,
    backgroundColor: '#1769FF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  allowCamText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  measureBody: { flex: 1, padding: 24, justifyContent: 'center', gap: 14 },
  measureHelp: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  measureCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 12,
  },
  measureValue: { fontSize: 48, fontWeight: '800' },
  validPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  validText: { fontWeight: '800', fontSize: 12 },
  confidenceLabel: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  confidenceTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  confidenceFill: { height: '100%', borderRadius: 4 },
  measureActions: { gap: 10, marginTop: 12 },
  resultFill: { flex: 1 },
  resultClose: { position: 'absolute', top: 18, right: 18, zIndex: 2, padding: 8 },
  resultBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#16C784',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resultTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  resultSummary: { color: '#A3B3CC', textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  resultActionsTitle: { color: '#fff', fontWeight: '800', alignSelf: 'flex-start', marginTop: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  actionCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(22,199,132,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#E8EEF8', fontSize: 14 },
  confPct: { color: '#A3B3CC', alignSelf: 'stretch', marginTop: 12, fontSize: 12 },
  confBarDark: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#203957',
    alignSelf: 'stretch',
    overflow: 'hidden',
    marginBottom: 12,
  },
  confBarFill: { height: '100%', backgroundColor: '#16C784' },
  reportHero: { borderRadius: 18, overflow: 'hidden', marginBottom: 8 },
  craftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 8, 15, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    padding: 24,
  },
  craftCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  craftIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(23,105,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  craftTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  craftBarTrack: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1E293B',
    overflow: 'hidden',
    marginBottom: 16,
  },
  craftBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#1769FF',
  },
  craftStep: {
    alignSelf: 'stretch',
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 6,
  },
  detailsTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  detailRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  detailLabel: { fontSize: 11, fontWeight: '600' },
  detailValue: { fontSize: 14, fontWeight: '700' },
  infoCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  infoLead: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  infoBody: { fontSize: 13, textAlign: 'center' },
  helpLine: { fontSize: 13, lineHeight: 20, alignSelf: 'stretch' },
  helpMail: { marginTop: 10, fontWeight: '700' },
  bottomNav: {
    height: 64,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 4,
  },
  bottomItem: { alignItems: 'center', gap: 3, minWidth: 64 },
  bottomLabel: { fontSize: 10, fontWeight: '700' },
});
