import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

export function HomeWave({ color }: { color: string }) {
  return (
    <Svg
      width="100%"
      height={210}
      viewBox="0 0 400 210"
      preserveAspectRatio="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      pointerEvents="none"
    >
      <Path d="M0 96 C 70 40 130 150 210 96 C 290 42 340 90 400 64 L 400 210 L 0 210 Z" fill={color} opacity={0.45} />
      <Path d="M0 132 C 90 90 150 170 240 124 C 310 90 350 140 400 112 L 400 210 L 0 210 Z" fill={color} opacity={0.95} />
    </Svg>
  );
}

export function SolarFarm({ height = 168, radius = 18 }: { height?: number; radius?: number }) {
  return (
    <View style={{ height, borderRadius: radius, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice">
        <Rect width="360" height="180" fill="#8ED4FA" />
        <Circle cx="292" cy="38" r="16" fill="#FFE08A" />
        <Ellipse cx="70" cy="48" rx="28" ry="12" fill="#FFFFFF" opacity={0.85} />
        <Ellipse cx="98" cy="46" rx="20" ry="10" fill="#FFFFFF" opacity={0.7} />
        <Path d="M0 118 C 70 92 120 108 180 100 C 250 90 300 112 360 96 L 360 180 L 0 180 Z" fill="#8BC34A" />
        <Path d="M0 138 C 80 120 140 146 220 128 C 280 116 320 136 360 124 L 360 180 L 0 180 Z" fill="#689F38" />
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, col) => (
            <Rect
              key={`${row}-${col}`}
              x={28 + col * 52}
              y={86 + row * 18}
              width="46"
              height="13"
              rx="1.5"
              fill={row === 1 ? '#1D4E9C' : '#2E6FE0'}
            />
          )),
        )}
        {Array.from({ length: 3 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, col) => (
            <Rect
              key={`g-${row}-${col}`}
              x={28 + col * 52}
              y={92 + row * 18}
              width="46"
              height="1.2"
              fill="#D6E6FF"
              opacity={0.8}
            />
          )),
        )}
      </Svg>
    </View>
  );
}

export function JunctionScene() {
  return (
    <View style={{ flex: 1, backgroundColor: '#12181C' }}>
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Rect width="400" height="800" fill="#1A2428" />
        <Path d="M0 250 C 80 210 140 230 200 214 C 280 192 320 220 400 190 L 400 800 L 0 800 Z" fill="#243028" />
        <Path d="M0 340 C 100 300 160 330 240 310 C 300 296 340 320 400 300 L 400 800 L 0 800 Z" fill="#1C3324" />
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 4 }).map((__, col) => (
            <Rect key={`p-${row}-${col}`} x={18 + col * 96} y={150 + row * 28} width="84" height="18" rx="2" fill="#1E4E86" opacity={0.55} />
          )),
        )}
        <Rect x="188" y="250" width="18" height="250" fill="#2C3136" />
        <Rect x="92" y="300" width="216" height="168" rx="10" fill="#4A515A" />
        <Rect x="104" y="314" width="192" height="140" rx="6" fill="#3C434B" />
        <Rect x="124" y="338" width="70" height="36" rx="4" fill="#2A3036" />
        <Rect x="206" y="338" width="70" height="36" rx="4" fill="#2A3036" />
        <Circle cx="148" cy="356" r="7" fill="#C5CDD6" />
        <Circle cx="230" cy="356" r="7" fill="#C5CDD6" />
        <Path d="M150 392 C 150 430 120 450 96 470" stroke="#E10600" strokeWidth="6" fill="none" strokeLinecap="round" />
        <Path d="M230 392 C 236 440 270 456 304 478" stroke="#111" strokeWidth="6" fill="none" strokeLinecap="round" />
        <Path d="M190 430 L 190 500" stroke="#F5C400" strokeWidth="5" strokeLinecap="round" />
        <Rect x="168" y="470" width="64" height="18" rx="3" fill="#6B737C" />
      </Svg>
    </View>
  );
}
