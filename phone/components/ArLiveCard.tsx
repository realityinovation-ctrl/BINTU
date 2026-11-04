import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { Camera, Pause, X } from 'lucide-react-native';
import type { OverlayPayload } from '@/lib/api';
import { LiveVideoPreview } from '@/components/LiveVideoPreview';

type Props = {
  cameraRef: React.RefObject<any>;
  permissionGranted: boolean;
  overlay: OverlayPayload | null;
  onClose: () => void;
  onCapture: () => void;
  onAskPermission: () => void;
  allowLabel: string;
  recordingLabel?: string;
  compact?: boolean;
  /** Live mode: fluid video only — no shutter / capture chrome. */
  silentLive?: boolean;
  /** Web Live preview stream (same stream used for silent JPEG grabs). */
  previewStream?: MediaStream | null;
};

type BoxEl = {
  type: 'BOUNDING_BOX';
  label: string;
  coordinates: { x: number; y: number; width: number; height: number };
  style?: { color?: string };
};

type ArrowEl = {
  type: 'ARROW';
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  style?: { color?: string };
};

type FormulaEl = {
  type: 'FORMULA_BOX';
  position: { x: number; y: number };
  title: string;
  formula_latex: string;
  value_expected: string;
};

type BubbleEl = {
  type: 'INFO_BUBBLE';
  position: { x: number; y: number };
  title: string;
  text: string;
};

type CircleEl = {
  type: 'CIRCLE';
  center: { x: number; y: number };
  radius: number;
  label: string;
  style?: { color?: string };
};

type TableEl = {
  type: 'TABLE';
  label: string;
  position: { x: number; y: number };
  headers: string[];
  rows: string[][];
  style?: { color?: string };
};

function asElements(overlay: OverlayPayload | null) {
  const raw = overlay?.overlay_instructions?.elements;
  return Array.isArray(raw) ? raw : [];
}

function ArrowGlyph({
  from,
  to,
  color,
  label,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  label: string;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Flèches courtes : plafonnées pour éviter le désordre.
  const rawLen = Math.sqrt(dx * dx + dy * dy) * 100;
  const lengthPct = Math.max(3.5, Math.min(12, rawLen || 8));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = ((from.x + to.x) / 2) * 100;
  const midY = ((from.y + to.y) / 2) * 100;
  return (
    <>
      <View
        style={[
          styles.arrowShaft,
          {
            left: `${from.x * 100}%`,
            top: `${from.y * 100}%`,
            width: `${lengthPct}%`,
            backgroundColor: color,
            transform: [{ translateY: -1.5 }, { rotate: `${angle}deg` }],
          },
        ]}
      />
      <View
        style={[
          styles.arrowHead,
          {
            left: `${to.x * 100}%`,
            top: `${to.y * 100}%`,
            borderBottomColor: color,
            transform: [
              { translateX: -6 },
              { translateY: -8 },
              { rotate: `${angle + 90}deg` },
            ],
          },
        ]}
      />
      {!!label?.trim() && (
        <View
          style={[
            styles.verifyChip,
            {
              left: `${Math.min(72, Math.max(4, midX - 6))}%`,
              top: `${Math.min(84, Math.max(6, midY - 10))}%`,
              backgroundColor: color,
            },
          ]}
        >
          <Text style={styles.verifyText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </>
  );
}

export function ArLiveCard({
  cameraRef,
  permissionGranted,
  overlay,
  onClose,
  onCapture,
  onAskPermission,
  allowLabel,
  recordingLabel = 'LIVE',
  compact = false,
  silentLive = false,
  previewStream = null,
}: Props) {
  const elements = useMemo(() => asElements(overlay), [overlay]);
  const boxes = elements.filter((item): item is BoxEl => item?.type === 'BOUNDING_BOX');
  const arrows = elements.filter((item): item is ArrowEl => item?.type === 'ARROW').slice(0, 2);
  const circles = elements.filter((item): item is CircleEl => item?.type === 'CIRCLE');
  const formulas = elements.filter((item): item is FormulaEl => item?.type === 'FORMULA_BOX');
  // Bubbles désactivées en Live silencieux (trop de texte).
  const bubbles = silentLive
    ? []
    : elements.filter((item): item is BubbleEl => item?.type === 'INFO_BUBBLE');
  const tables = elements.filter((item): item is TableEl => item?.type === 'TABLE');
  const prompt = (overlay?.action_required?.prompt || '').trim();
  const useWebLivePreview =
    silentLive && Platform.OS === 'web' && previewStream != null;
  const hasGuide =
    boxes.length + arrows.length + circles.length + formulas.length + tables.length >
    0;
  // Live : pas de bandeau texte tant qu'il n'y a pas de cadre / symbole.
  const showPrompt = !!prompt && (!silentLive || hasGuide);

  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      {permissionGranted ? (
        useWebLivePreview ? (
          <LiveVideoPreview stream={previewStream} />
        ) : (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      <View style={styles.topBar}>
        <View style={styles.recRow}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>{recordingLabel}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <X size={16} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.stage} pointerEvents="none">
        {boxes.map((box, index) => {
          const color = box.style?.color || '#FF3B30';
          return (
            <View
              key={`box-${index}`}
              style={[
                styles.box,
                {
                  left: `${box.coordinates.x * 100}%`,
                  top: `${box.coordinates.y * 100}%`,
                  width: `${box.coordinates.width * 100}%`,
                  height: `${box.coordinates.height * 100}%`,
                  borderColor: color,
                },
              ]}
            >
              <View style={[styles.boxTag, { backgroundColor: color }]}>
                <Text style={styles.boxTagText} numberOfLines={1}>
                  {box.label}
                </Text>
              </View>
            </View>
          );
        })}

        {circles.map((circle, index) => {
          const color = circle.style?.color || '#1769FF';
          const diameter = Math.max(8, Math.min(22, circle.radius * 2 * 100));
          return (
            <View
              key={`circle-${index}`}
              style={[
                styles.circle,
                {
                  left: `${circle.center.x * 100}%`,
                  top: `${circle.center.y * 100}%`,
                  width: `${diameter}%`,
                  height: `${diameter}%`,
                  marginLeft: `${-diameter / 2}%`,
                  marginTop: `${-diameter / 2}%`,
                  borderColor: color,
                },
              ]}
            >
              {!!circle.label && (
                <Text style={styles.circleLabel} numberOfLines={1}>
                  {circle.label}
                </Text>
              )}
            </View>
          );
        })}

        {arrows.map((arrow, index) => (
          <ArrowGlyph
            key={`arrow-${index}`}
            from={arrow.from}
            to={arrow.to}
            color={arrow.style?.color || '#FF8A14'}
            label={arrow.label}
          />
        ))}

        {formulas.map((formula, index) => (
          <View
            key={`formula-${index}`}
            style={[
              styles.infoPanel,
              {
                left: `${Math.min(58, Math.max(4, formula.position.x * 100))}%`,
                top: `${Math.min(72, Math.max(8, formula.position.y * 100))}%`,
              },
            ]}
          >
            <Text style={styles.infoTitle}>{formula.title}</Text>
            <Text style={styles.infoFormula}>{formula.formula_latex}</Text>
            <Text style={styles.infoValue}>{formula.value_expected}</Text>
          </View>
        ))}

        {bubbles.map((bubble, index) => (
          <View
            key={`bubble-${index}`}
            style={[
              styles.whiteNote,
              {
                left: `${Math.min(62, Math.max(4, bubble.position.x * 100))}%`,
                top: `${Math.min(70, Math.max(6, bubble.position.y * 100))}%`,
              },
            ]}
          >
            <Text style={styles.whiteTitle}>{bubble.title}</Text>
            <Text style={styles.whiteBody} numberOfLines={2}>
              {bubble.text}
            </Text>
          </View>
        ))}

        {tables.map((table, index) => {
          const accent = table.style?.color || '#FFFFFF';
          return (
            <View
              key={`table-${index}`}
              style={[
                styles.tablePanel,
                {
                  left: `${Math.min(52, Math.max(3, table.position.x * 100))}%`,
                  top: `${Math.min(58, Math.max(8, table.position.y * 100))}%`,
                  borderColor:
                    accent === '#FFFFFF' ? 'rgba(255,255,255,0.65)' : accent,
                },
              ]}
            >
              {!!table.label && (
                <Text style={styles.tableTitle} numberOfLines={1}>
                  {table.label}
                </Text>
              )}
              {table.headers.length > 0 && (
                <View style={styles.tableRow}>
                  {table.headers.map((header, hi) => (
                    <Text
                      key={`h-${hi}`}
                      style={[styles.tableCell, styles.tableHeader]}
                      numberOfLines={1}
                    >
                      {header}
                    </Text>
                  ))}
                </View>
              )}
              {table.rows.map((row, ri) => (
                <View key={`r-${ri}`} style={styles.tableRow}>
                  {row.map((cell, ci) => (
                    <Text key={`c-${ci}`} style={styles.tableCell} numberOfLines={1}>
                      {cell}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          );
        })}

        {/* Démo uniquement hors Live — Live démarre écran vide. */}
        {!hasGuide && !silentLive ? (
          <View style={[styles.box, styles.demoBox]}>
            <View style={[styles.boxTag, { backgroundColor: '#FF3B30' }]}>
              <Text style={styles.boxTagText}>Zone</Text>
            </View>
          </View>
        ) : null}
      </View>

      {showPrompt ? (
        <View style={[styles.promptBar, silentLive && styles.promptBarLive]}>
          <Text style={styles.promptText} numberOfLines={1}>
            {prompt}
          </Text>
        </View>
      ) : null}

      {!silentLive ? (
        <View style={styles.controls}>
          <Pressable style={styles.sideBtn}>
            <Pause size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={onCapture} style={styles.shutter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <Pressable onPress={onCapture} style={styles.sideBtn}>
            <Camera size={18} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {!permissionGranted && (
        <Pressable onPress={onAskPermission} style={styles.allowBtn}>
          <Text style={styles.allowText}>{allowLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0A0A0A',
    marginTop: 8,
  },
  rootCompact: {
    aspectRatio: 16 / 9,
  },
  fallback: {
    backgroundColor: '#1A2333',
  },
  topBar: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    zIndex: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  recText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    ...StyleSheet.absoluteFill,
  },
  box: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 5,
  },
  circle: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  circleLabel: {
    marginTop: -18,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  arrowShaft: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    transformOrigin: 'left center',
  },
  arrowHead: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  demoBox: {
    left: '28%',
    top: '24%',
    width: '40%',
    height: '22%',
    borderColor: '#FF3B30',
  },
  boxTag: {
    position: 'absolute',
    top: -26,
    left: 0,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 160,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  boxTagText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  verifyChip: {
    position: 'absolute',
    maxWidth: '40%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  verifyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  infoPanel: {
    position: 'absolute',
    width: 168,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(12, 24, 48, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  infoTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  infoFormula: {
    color: '#D7E6FF',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  whiteNote: {
    position: 'absolute',
    width: 140,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  whiteTitle: {
    color: '#0E1F4B',
    fontSize: 12,
    fontWeight: '900',
  },
  whiteBody: {
    color: '#31486F',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tablePanel: {
    position: 'absolute',
    minWidth: 160,
    maxWidth: '46%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(6, 12, 24, 0.92)',
    borderWidth: 1,
  },
  tableTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 3,
  },
  tableCell: {
    flex: 1,
    color: '#F2F6FF',
    fontSize: 11,
    fontWeight: '700',
  },
  tableHeader: {
    color: '#A8C0FF',
    fontWeight: '900',
    fontSize: 11,
  },
  promptBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 86,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promptBarLive: {
    bottom: 12,
  },
  promptText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 22,
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
  },
  allowBtn: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 96,
    backgroundColor: '#1769FF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  allowText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
});
