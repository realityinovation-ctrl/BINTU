import { useMemo, useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ArrowUp, Camera, Copy, FileText, Mic } from 'lucide-react-native';
import {
  Chat,
  type BubbleProps,
  type IMessage,
  type User,
} from '@kesha-antonov/react-native-chat';
import { TypewriterText } from '@/components/TypewriterText';

export type BintuChatMessage = IMessage & {
  cameraCta?: boolean;
  reportCta?: boolean;
  kind?: 'question' | 'measure' | 'image' | 'diagnosis' | 'error' | 'info';
  animate?: boolean;
};

type Palette = {
  bg: string;
  card: string;
  soft: string;
  text: string;
  muted: string;
  border: string;
  blue: string;
  blueSoft?: string;
  green: string;
  input: string;
};

type Props = {
  messages: BintuChatMessage[];
  colors: Palette;
  dark: boolean;
  locale: 'fr' | 'en';
  busy: boolean;
  draft: string;
  listening: boolean;
  voiceCaption?: string;
  liveCam: boolean;
  placeholder: string;
  shareCameraLabel: string;
  seeReportLabel: string;
  header: ReactNode;
  footer?: ReactNode;
  onChangeDraft: (value: string) => void;
  onSendText: (text: string) => void;
  onToggleVoice: () => void;
  onOpenCamera: () => void;
  onSeeReport: () => void;
};

const TECHNICIAN: User = { _id: 'technician', name: 'Technicien' };
const BINTU: User = { _id: 'bintu', name: 'BINTU' };

export function makeUserMessage(text: string): BintuChatMessage {
  return {
    _id: `${Date.now()}-u`,
    text,
    createdAt: new Date(),
    user: TECHNICIAN,
    sent: true,
  };
}

export function makeBotMessage(
  text: string,
  extras: Partial<BintuChatMessage> = {},
): BintuChatMessage {
  return {
    _id: `${Date.now()}-b-${Math.random().toString(36).slice(2, 7)}`,
    text,
    createdAt: new Date(),
    user: BINTU,
    kind: 'info',
    animate: true,
    ...extras,
  };
}

function buildSuggestions(
  messages: BintuChatMessage[],
  draft: string,
  locale: 'fr' | 'en',
): string[] {
  const fr = locale === 'fr';
  const draftLower = draft.trim().toLowerCase();
  const userTurns = messages.filter((m) => m.user?._id === TECHNICIAN._id);
  const lastBot = [...messages].reverse().find((m) => m.user?._id === BINTU._id);

  const starters = fr
    ? [
        'Le panneau ne produit plus assez',
        'L’onduleur affiche une erreur',
        'Montrer l’équipement à la caméra',
      ]
    : [
        'The panel is underproducing',
        'The inverter shows an error',
        'Show the equipment on camera',
      ];

  const social =
    /comment vas|comment ça va|comment ca va|ça va|ca va|bonjour|salut|hello|merci|qui es/.test(
      draftLower,
    ) ||
    /comment vas|comment ça va|ça va|bonjour|salut/.test(
      userTurns[userTurns.length - 1]?.text?.toLowerCase() || '',
    );

  if (social && !/panne|ondul|panneau|erreur|volt|mesure/.test(draftLower)) {
    return fr
      ? ['Ça va et toi ?', 'Aide-moi sur une panne', 'Montrer l’équipement']
      : ['I am fine, and you?', 'Help me with a fault', 'Show the equipment'];
  }

  if (userTurns.length === 0) {
    if (draftLower.length >= 2) {
      if (/ondul|invert/.test(draftLower)) {
        return fr
          ? ['Erreur sur l’afficheur', 'Voyant rouge allumé', 'Redémarrer l’onduleur ?']
          : ['Display error', 'Red light on', 'Try restarting the inverter?'];
      }
      if (/panneau|solaire|pv|panel/.test(draftLower)) {
        return fr
          ? ['Production trop basse', 'Ombrage possible', 'Chaîne PV1 en défaut']
          : ['Output too low', 'Possible shading', 'PV1 string fault'];
      }
      if (/bruit|chaud|odeur|noise|hot/.test(draftLower)) {
        return fr
          ? ['Bruit anormal près du boîtier', 'Odeur de brûlé', 'Surface trop chaude']
          : ['Unusual noise near the box', 'Burning smell', 'Surface too hot'];
      }
      return fr
        ? [`Préciser : ${draft.trim()}`, 'Ajouter le lieu / site', 'Montrer à la caméra']
        : [`Clarify: ${draft.trim()}`, 'Add the site location', 'Show on camera'];
    }
    return starters;
  }

  if (lastBot?.kind === 'image' || lastBot?.cameraCta) {
    return fr
      ? ['Ouvrir la caméra', 'Décrire sans photo', 'C’est une plaque signalétique']
      : ['Open camera', 'Describe without a photo', 'It is a nameplate'];
  }
  if (lastBot?.kind === 'measure') {
    return fr
      ? ['Environ 380 V', 'Je n’ai pas de multimètre', 'Mesure à reprendre']
      : ['About 380 V', 'I have no multimeter', 'Need to measure again'];
  }
  if (lastBot?.kind === 'question') {
    if (draftLower.length >= 2) {
      return fr
        ? [`Oui — ${draft.trim()}`, 'Non, autre chose', 'Je prends une photo']
        : [`Yes — ${draft.trim()}`, 'No, something else', 'I will take a photo'];
    }
    return fr
      ? ['Oui, c’est ça', 'Je ne suis pas sûr', 'Je montre avec la caméra']
      : ['Yes, that is it', 'I am not sure', 'I will show it on camera'];
  }
  if (draftLower.length >= 2) {
    return fr
      ? [`Envoyer : ${draft.trim().slice(0, 42)}`, 'Montrer la caméra', 'Parler au micro']
      : [`Send: ${draft.trim().slice(0, 42)}`, 'Open camera', 'Use the mic'];
  }
  return fr
    ? ['Préciser le symptôme', 'Montrer l’équipement', 'Parler au micro']
    : ['Clarify the symptom', 'Show the equipment', 'Use the mic'];
}

export function DiagnosticChat({
  messages,
  colors,
  dark,
  locale,
  busy,
  draft,
  listening,
  voiceCaption = '',
  liveCam,
  placeholder,
  shareCameraLabel,
  seeReportLabel,
  header,
  footer,
  onChangeDraft,
  onSendText,
  onToggleVoice,
  onOpenCamera,
  onSeeReport,
}: Props) {
  const typedDone = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  const theme = useMemo(
    () => ({
      colors: {
        accent: colors.blue,
        background: colors.bg,
        incomingBubble: 'transparent',
        outgoingBubble: 'transparent',
        incomingText: colors.text,
        outgoingText: colors.text,
        incomingMeta: colors.muted,
        outgoingMeta: colors.muted,
        senderName: colors.blue,
        ticksSent: colors.muted,
        ticksRead: colors.green,
        separator: 'transparent',
        inputBackground: colors.input,
        inputBarBackground: colors.bg,
        inputText: colors.text,
        placeholder: colors.muted,
        dayPillBackground: 'transparent',
        dayPillText: colors.muted,
        surface: colors.bg,
        reactionBackground: colors.soft,
        reactionActiveBackground: colors.blueSoft ?? colors.soft,
        outgoingOverlay: 'transparent',
        error: '#F04452',
        inputFieldBorder: colors.border,
      },
    }),
    [colors],
  );

  const suggestions = useMemo(
    () => buildSuggestions(messages, draft, locale).slice(0, 3),
    [draft, locale, messages],
  );

  const copyMessage = useCallback(
    async (message: BintuChatMessage) => {
      if (!message.text?.trim()) return;
      await Clipboard.setStringAsync(message.text);
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert('BINTU', locale === 'fr' ? 'Message copié.' : 'Message copied.');
    },
    [locale],
  );

  const renderBubble = useCallback(
    (props: BubbleProps<BintuChatMessage>) => {
      const message = props.currentMessage;
      if (!message) return null;
      const mine = message.user?._id === TECHNICIAN._id;
      const id = String(message._id);
      const shouldAnimate =
        !mine && message.animate !== false && !typedDone.current.has(id);

      if (mine) {
        return (
          <View style={styles.userWrap}>
            <Text style={[styles.userText, { color: colors.text }]}>{message.text}</Text>
          </View>
        );
      }

      return (
        <View style={styles.geminiStack}>
          <TypewriterText
            text={message.text || ''}
            animate={shouldAnimate}
            style={{
              color: colors.text,
              fontSize: 17,
              lineHeight: 26,
              fontWeight: '400',
              letterSpacing: 0.1,
            }}
            onDone={() => {
              if (!typedDone.current.has(id)) {
                typedDone.current.add(id);
                bump((n) => n + 1);
              }
            }}
          />
          {!!message.cameraCta && (
            <Pressable
              onPress={onOpenCamera}
              style={[styles.actionBtn, { backgroundColor: colors.blue }]}
            >
              <Camera size={16} color="#fff" />
              <Text style={styles.actionText}>{shareCameraLabel}</Text>
            </Pressable>
          )}
          {!!message.reportCta && (
            <Pressable
              onPress={onSeeReport}
              style={[styles.actionBtn, { backgroundColor: colors.green }]}
            >
              <FileText size={16} color="#fff" />
              <Text style={styles.actionText}>{seeReportLabel}</Text>
            </Pressable>
          )}
        </View>
      );
    },
    [colors, onOpenCamera, onSeeReport, seeReportLabel, shareCameraLabel],
  );

  const livePlaceholder = listening
    ? locale === 'fr'
      ? 'Discussion orale — rien à taper'
      : 'Voice call — nothing to type'
    : placeholder;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {header}
      {listening ? (
        <View
          style={[
            styles.voiceLiveBar,
            { backgroundColor: colors.soft, borderColor: colors.border },
          ]}
        >
          <View style={[styles.voiceLiveDot, { backgroundColor: colors.green }]} />
          <Text style={[styles.voiceLiveText, { color: colors.text }]} numberOfLines={2}>
            {voiceCaption ||
              (locale === 'fr'
                ? 'Micro ouvert — BINTU répond à l’oral'
                : 'Mic open — BINTU answers out loud')}
          </Text>
        </View>
      ) : null}
      <Chat
        messages={messages}
        user={TECHNICIAN}
        text={draft}
        onSend={(outgoing) => {
          const text = outgoing[0]?.text?.trim();
          if (text) onSendText(text);
        }}
        isTyping={busy}
        locale={locale === 'fr' ? 'fr' : 'en'}
        colorScheme={dark ? 'dark' : 'light'}
        theme={theme}
        darkTheme={theme}
        isScrollToBottomEnabled
        isAlignedTop="auto"
        labels={{
          placeholder: livePlaceholder,
          send: locale === 'fr' ? 'Envoyer' : 'Send',
        }}
        icons={{
          send: ({ color, size }) => <ArrowUp color={color} size={size} />,
          mic: ({ color, size }) => <Mic color={color} size={size} />,
          camera: ({ color, size }) => <Camera color={color} size={size} />,
        }}
        messageActions={(message) => [
          {
            label: locale === 'fr' ? 'Copier le message' : 'Copy message',
            icon: ({ size = 18, color = colors.text }) => (
              <Copy size={size} color={color} />
            ),
            onPress: () => {
              void copyMessage(message);
            },
          },
        ]}
        renderBubble={renderBubble}
        renderActions={() => (
          <View style={styles.leadingActions}>
            <Pressable
              onPress={onToggleVoice}
              style={[
                styles.toolBtn,
                { backgroundColor: listening ? colors.blue : colors.soft },
              ]}
            >
              <Mic size={18} color={listening ? '#fff' : colors.blue} />
            </Pressable>
            <Pressable
              onPress={onOpenCamera}
              style={[
                styles.toolBtn,
                { backgroundColor: liveCam ? colors.blue : colors.soft },
              ]}
            >
              <Camera size={18} color={liveCam ? '#fff' : colors.blue} />
            </Pressable>
          </View>
        )}
        textInputProps={{
          editable: !busy,
          placeholderTextColor: colors.muted,
          onChangeText: onChangeDraft,
          style: {
            color: colors.text,
            backgroundColor: colors.input,
            borderRadius: 22,
            paddingHorizontal: 16,
            paddingVertical: Platform.OS === 'ios' ? 11 : 9,
            maxHeight: 120,
          },
        }}
        enableGestureHandlerRootView={false}
        keyboardAvoidingViewProps={{
          keyboardVerticalOffset: Platform.OS === 'ios' ? 8 : 0,
        }}
        listProps={{
          contentContainerStyle: {
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 8,
          },
        }}
        renderChatFooter={() => (
          <View style={styles.footer}>
            {!listening && suggestions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestRow}
                keyboardShouldPersistTaps="handled"
              >
                {suggestions.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => {
                      if (item.startsWith('Envoyer : ') || item.startsWith('Send: ')) {
                        onSendText(draft.trim() || item.replace(/^(Envoyer : |Send: )/, ''));
                        return;
                      }
                      if (
                        item.toLowerCase().includes('caméra') ||
                        item.toLowerCase().includes('camera')
                      ) {
                        onOpenCamera();
                        return;
                      }
                      if (
                        item.toLowerCase().includes('micro') ||
                        item.toLowerCase().includes('mic')
                      ) {
                        onToggleVoice();
                        return;
                      }
                      onSendText(item);
                    }}
                    style={[
                      styles.suggestChip,
                      { borderColor: colors.border, backgroundColor: colors.soft },
                    ]}
                  >
                    <Text style={[styles.suggestText, { color: colors.text }]} numberOfLines={1}>
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {footer}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  voiceLiveBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceLiveDot: { width: 8, height: 8, borderRadius: 4 },
  voiceLiveText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  footer: { paddingBottom: 4 },
  geminiStack: {
    maxWidth: '100%',
    paddingVertical: 6,
    paddingRight: 12,
    gap: 10,
  },
  userWrap: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    paddingVertical: 4,
  },
  userText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    textAlign: 'right',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  suggestRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  suggestChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: 260,
  },
  suggestText: { fontSize: 13, fontWeight: '600' },
  leadingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingBottom: 6,
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
