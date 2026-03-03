import React, { memo } from 'react';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

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
  accessibilityLabel?: string;
};

// Map app icon names to MaterialCommunityIcons names
const ICON_MAP: Record<string, string> = {
  image: 'image-outline',
  compress: 'file-compress',
  eye: 'eye-outline',
  crown: 'crown-outline',
  'chevron-right': 'chevron-right',
  'chevron-left': 'chevron-left',
  chevronUp: 'chevron-up',
  chevronDown: 'chevron-down',
  close: 'close',
  check: 'check',
  'check-circle': 'check-circle-outline',
  'alert-circle': 'alert-circle-outline',
  share: 'share-variant-outline',
  'share-2': 'share-variant-outline',
  download: 'download-outline',
  delete: 'delete-outline',
  'file-pdf': 'file-pdf-box',
  'file-plus': 'file-plus-outline',
  'file-check': 'file-check-outline',
  'file-minus': 'file-minus-outline',
  'file-x': 'file-remove-outline',
  file: 'file-outline',
  'file-image': 'file-image-outline',
  clock: 'clock-outline',
  settings: 'cog-outline',
  home: 'home-outline',
  plus: 'plus',
  x: 'close',
  camera: 'camera-outline',
  gallery: 'image-multiple-outline',
  menu: 'menu',
  info: 'information-outline',
  fullscreen: 'fullscreen',
  'fullscreen-exit': 'fullscreen-exit',
  sun: 'weather-sunny',
  moon: 'weather-night',
  bookmark: 'bookmark',
  'bookmark-outline': 'bookmark-outline',
  layers: 'layers-outline',
  'minimize-2': 'arrow-collapse-all',
  star: 'star-outline',
  type: 'format-text',
  copy: 'content-copy',
  'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left',
  'trending-down': 'trending-down',
  'edit-3': 'pencil-outline',
  'pen-tool': 'pen',
  scissors: 'content-cut',
  lock: 'lock-outline',
  unlock: 'lock-open-variant-outline',
  grid: 'view-grid-outline',
  list: 'view-list-outline',
  'trash-2': 'delete-outline',
  search: 'magnify',
  'file-text': 'file-document-outline',
};

function Icon({ name, size = 24, color, accessibilityLabel }: IconProps) {
  const iconName = ICON_MAP[name] || name;

  return (
    <MaterialCommunityIcons
      name={iconName}
      size={size}
      color={color || '#475569'}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export default memo(Icon);
