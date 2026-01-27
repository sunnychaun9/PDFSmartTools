import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// In production, replace with react-native-vector-icons or react-native-svg
// Example: import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

export type IconName =
  | 'image'
  | 'compress'
  | 'eye'
  | 'crown'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevronUp'
  | 'chevronDown'
  | 'close'
  | 'check'
  | 'check-circle'
  | 'alert-circle'
  | 'share'
  | 'share-2'
  | 'download'
  | 'delete'
  | 'file-pdf'
  | 'file-plus'
  | 'file-check'
  | 'file-minus'
  | 'file-x'
  | 'file'
  | 'file-image'
  | 'clock'
  | 'settings'
  | 'home'
  | 'plus'
  | 'x'
  | 'camera'
  | 'gallery'
  | 'menu'
  | 'info'
  | 'fullscreen'
  | 'fullscreen-exit'
  | 'sun'
  | 'moon'
  | 'bookmark'
  | 'bookmark-outline'
  | 'layers'
  | 'minimize-2'
  | 'star'
  | 'type'
  | 'copy'
  | 'arrow-right'
  | 'arrow-left'
  | 'trending-down'
  | 'edit-3'
  | 'pen-tool'
  | 'scissors'
  | 'lock'
  | 'unlock'
  | 'grid'
  | 'list'
  | 'trash-2';

type IconProps = {
  name: IconName | string;
  size?: number;
  color?: string;
};

// Emoji mapping for development (replace with actual icons in production)
const ICON_MAP: Record<string, string> = {
  image: '🖼️',
  compress: '📦',
  eye: '👁️',
  crown: '👑',
  'chevron-right': '›',
  'chevron-left': '‹',
  chevronUp: '▲',
  chevronDown: '▼',
  close: '✕',
  check: '✓',
  'check-circle': '✅',
  'alert-circle': '⚠️',
  share: '↗️',
  'share-2': '↗️',
  download: '⬇️',
  delete: '🗑️',
  'file-pdf': '📄',
  'file-plus': '📄',
  'file-check': '✅',
  'file-minus': '📄',
  'file-x': '📄',
  'file': '📄',
  'file-image': '🖼️',
  clock: '🕒',
  settings: '⚙️',
  home: '🏠',
  plus: '+',
  x: '✕',
  camera: '📷',
  gallery: '🖼️',
  menu: '☰',
  info: 'ℹ️',
  fullscreen: '⛶',
  'fullscreen-exit': '⛶',
  sun: '☀️',
  moon: '🌙',
  bookmark: '🔖',
  'bookmark-outline': '🏷️',
  layers: '📑',
  'minimize-2': '🗜️',
  star: '⭐',
  type: '🔤',
  copy: '📋',
  'arrow-right': '→',
  'arrow-left': '←',
  'trending-down': '📉',
  'edit-3': '✍️',
  'pen-tool': '🖊️',
  scissors: '✂️',
  lock: '🔐',
  unlock: '🔓',
  grid: '▦',
  list: '☰',
  'trash-2': '🗑️',
};

function Icon({ name, size = 24, color }: IconProps) {
  // For production, replace with actual icon library:
  // return <MaterialCommunityIcons name={name} size={size} color={color} />;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Text
        style={[
          styles.emoji,
          { fontSize: size * 0.7 },
          color ? { color } : null,
        ]}
      >
        {ICON_MAP[name] || '•'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});

export default memo(Icon);
