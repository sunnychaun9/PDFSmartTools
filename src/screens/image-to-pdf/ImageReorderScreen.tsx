import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Image, Pressable } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon } from '../../components/ui';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { RootStackParamList, SelectedImage } from '../../navigation/types';

type ImageReorderNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ImageReorder'>;
type ImageReorderRouteProp = RouteProp<RootStackParamList, 'ImageReorder'>;

export default function ImageReorderScreen() {
  const navigation = useNavigation<ImageReorderNavigationProp>();
  const route = useRoute<ImageReorderRouteProp>();
  const [images, setImages] = useState<SelectedImage[]>(route.params.images);
  const [isDragging, setIsDragging] = useState(false);

  const handleDone = useCallback(() => {
    // Pass reordered images back to ImageToPdf screen
    navigation.navigate('ImageToPdf', { reorderedImages: images });
  }, [navigation, images]);

  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setImages((prev) => {
      const newImages = [...prev];
      [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
      return newImages;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setImages((prev) => {
      if (index === prev.length - 1) return prev;
      const newImages = [...prev];
      [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
      return newImages;
    });
  }, []);

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<SelectedImage>) => {
      const index = getIndex() ?? 0;
      return (
        <ScaleDecorator>
          <Pressable
            onLongPress={drag}
            disabled={isActive}
            style={[
              styles.imageItem,
              isActive && styles.imageItemActive,
            ]}
          >
            <View style={styles.imageContent}>
              <View style={styles.indexBadge}>
                <Text variant="body" customColor={colors.textOnPrimary}>
                  {index + 1}
                </Text>
              </View>
              <Image source={{ uri: item.uri }} style={styles.thumbnail} />
              <View style={styles.dragHandle}>
                <Icon name="menu" size={24} color={colors.textSecondary} />
              </View>
            </View>
            <View style={styles.moveButtons}>
              <Pressable
                style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
                onPress={() => handleMoveUp(index)}
                disabled={index === 0}
              >
                <Icon
                  name="chevronUp"
                  size={20}
                  color={index === 0 ? colors.textTertiary : colors.primary}
                />
              </Pressable>
              <Pressable
                style={[
                  styles.moveButton,
                  index === images.length - 1 && styles.moveButtonDisabled,
                ]}
                onPress={() => handleMoveDown(index)}
                disabled={index === images.length - 1}
              >
                <Icon
                  name="chevronDown"
                  size={20}
                  color={index === images.length - 1 ? colors.textTertiary : colors.primary}
                />
              </Pressable>
            </View>
          </Pressable>
        </ScaleDecorator>
      );
    },
    [handleMoveUp, handleMoveDown, images.length]
  );

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeScreen>
        <Header
          title="Reorder Images"
          leftAction={
            <Button title="Cancel" variant="ghost" size="sm" onPress={handleCancel} />
          }
          rightAction={
            <Button title="Done" variant="ghost" size="sm" onPress={handleDone} />
          }
        />

        <View style={styles.content}>
          <View style={styles.instructions}>
            <Icon name="info" size={16} color={colors.textTertiary} />
            <Spacer size="xs" horizontal />
            <Text variant="bodySmall" color="tertiary">
              Long press and drag to reorder, or use arrows
            </Text>
          </View>

          <DraggableFlatList
            data={images}
            onDragBegin={() => setIsDragging(true)}
            onDragEnd={({ data }) => {
              setImages(data);
              setIsDragging(false);
            }}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.footer}>
            <Text variant="caption" color="tertiary" align="center">
              {images.length} images total
            </Text>
          </View>
        </View>
      </SafeScreen>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  imageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    ...shadows.sm,
  },
  imageItemActive: {
    backgroundColor: colors.surfaceVariant,
    ...shadows.md,
  },
  imageContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceVariant,
  },
  dragHandle: {
    marginLeft: 'auto',
    padding: spacing.sm,
  },
  moveButtons: {
    flexDirection: 'column',
    marginLeft: spacing.sm,
  },
  moveButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceVariant,
    marginVertical: 2,
  },
  moveButtonDisabled: {
    opacity: 0.5,
  },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
