import React, { memo } from 'react';
import { View } from 'react-native';
import { spacing } from '../../theme';

type SpacerProps = {
  size?: keyof typeof spacing | number;
  horizontal?: boolean;
};

function Spacer({ size = 'md', horizontal = false }: SpacerProps) {
  const spacingValue = typeof size === 'number' ? size : spacing[size];

  return (
    <View
      style={{
        [horizontal ? 'width' : 'height']: spacingValue,
      }}
    />
  );
}

export default memo(Spacer);
