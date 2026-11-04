import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

type Props = {
  size?: number;
  id?: string;
};

export function BintuLogo({ size = 120, id = 'bintu' }: Props) {
  const arc = `${id}-arc`;
  const needle = `${id}-needle`;
  const hub = `${id}-hub`;

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id={arc} x1="40" y1="10" x2="160" y2="190" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#0D1B44" />
          <Stop offset="0.45" stopColor="#1E62FF" />
          <Stop offset="1" stopColor="#4EC6FF" />
        </LinearGradient>
        <LinearGradient id={needle} x1="100" y1="112" x2="148" y2="36" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE7A0" />
          <Stop offset="0.4" stopColor="#FFB02E" />
          <Stop offset="1" stopColor="#FF8A14" />
        </LinearGradient>
        <RadialGradient id={hub} cx="92" cy="90" r="22" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE7A0" />
          <Stop offset="0.55" stopColor="#FFC44A" />
          <Stop offset="1" stopColor="#F0A020" />
        </RadialGradient>
      </Defs>
      <Circle
        cx="100"
        cy="100"
        r="66"
        stroke={`url(#${arc})`}
        strokeWidth="30"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="318 97"
        transform="rotate(18 100 100)"
      />
      <G transform="rotate(42 100 100)">
        <Rect x="92.5" y="34" width="15" height="68" rx="7.5" fill={`url(#${needle})`} />
      </G>
      <Circle cx="100" cy="100" r="20" fill={`url(#${hub})`} />
      <Circle cx="94" cy="94" r="6" fill="#FFF4C8" opacity={0.85} />
    </Svg>
  );
}
