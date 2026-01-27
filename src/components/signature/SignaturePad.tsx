import React, { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import RNFS from 'react-native-fs';

export type SignaturePadRef = {
  clearSignature: () => void;
  readSignature: () => Promise<string | null>;
  isEmpty: () => boolean;
};

type SignaturePadProps = {
  penColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  onBegin?: () => void;
  onEnd?: () => void;
  style?: object;
};

type Point = {
  x: number;
  y: number;
};

type PathData = {
  points: Point[];
  color: string;
  strokeWidth: number;
};

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  (
    {
      penColor = '#000000',
      backgroundColor = '#FFFFFF',
      strokeWidth = 3,
      onBegin,
      onEnd,
      style,
    },
    ref
  ) => {
    const [paths, setPaths] = useState<PathData[]>([]);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);
    const viewShotRef = useRef<ViewShot>(null);

    // Use refs to track drawing state (avoid stale closures in gesture handlers)
    const isDrawingRef = useRef(false);
    const currentPathRef = useRef<Point[]>([]);
    const pathsRef = useRef<PathData[]>([]);

    // Keep refs in sync with state
    currentPathRef.current = currentPath;
    pathsRef.current = paths;

    // Convert points to SVG path string
    const pointsToPath = useCallback((points: Point[]): string => {
      if (points.length === 0) return '';
      if (points.length === 1) {
        // Single point - draw a dot
        const p = points[0];
        return `M ${p.x} ${p.y} L ${p.x + 0.5} ${p.y + 0.5}`;
      }

      let path = `M ${points[0].x} ${points[0].y}`;

      for (let i = 1; i < points.length; i++) {
        const curr = points[i];

        // Simple line drawing for better performance
        path += ` L ${curr.x} ${curr.y}`;
      }

      return path;
    }, []);

    // Gesture handler for drawing
    const panGesture = Gesture.Pan()
      .minDistance(0)
      .minPointers(1)
      .maxPointers(1)
      .onStart((event) => {
        isDrawingRef.current = true;
        const newPoint = { x: event.x, y: event.y };
        currentPathRef.current = [newPoint];
        setCurrentPath([newPoint]);
        onBegin?.();
      })
      .onUpdate((event) => {
        if (isDrawingRef.current) {
          const newPoint = { x: event.x, y: event.y };
          const newPath = [...currentPathRef.current, newPoint];
          currentPathRef.current = newPath;
          setCurrentPath(newPath);
        }
      })
      .onEnd(() => {
        if (isDrawingRef.current && currentPathRef.current.length > 0) {
          const newPathData: PathData = {
            points: [...currentPathRef.current],
            color: penColor,
            strokeWidth: strokeWidth,
          };
          const newPaths = [...pathsRef.current, newPathData];
          pathsRef.current = newPaths;
          setPaths(newPaths);
        }
        currentPathRef.current = [];
        setCurrentPath([]);
        isDrawingRef.current = false;
        onEnd?.();
      });

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      clearSignature: () => {
        pathsRef.current = [];
        currentPathRef.current = [];
        setPaths([]);
        setCurrentPath([]);
      },
      readSignature: async () => {
        if (pathsRef.current.length === 0) {
          return null;
        }
        try {
          const uri = await viewShotRef.current?.capture?.();
          if (uri) {
            // Read file and convert to base64 using RNFS
            const filePath = uri.replace('file://', '');
            const base64 = await RNFS.readFile(filePath, 'base64');
            return `data:image/png;base64,${base64}`;
          }
          return null;
        } catch (error) {
          console.error('Error capturing signature:', error);
          return null;
        }
      },
      isEmpty: () => pathsRef.current.length === 0,
    }));

    return (
      <GestureHandlerRootView style={[styles.container, style]}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1, result: 'tmpfile' }}
          style={styles.viewShot}
        >
          <View style={[styles.canvas, { backgroundColor }]}>
            <GestureDetector gesture={panGesture}>
              <View style={styles.gestureArea}>
                <Svg style={styles.svg} viewBox={undefined}>
                  {/* Render completed paths */}
                  {paths.map((pathData, index) => (
                    <Path
                      key={`path-${index}`}
                      d={pointsToPath(pathData.points)}
                      stroke={pathData.color}
                      strokeWidth={pathData.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
                  {/* Render current path being drawn */}
                  {currentPath.length > 0 && (
                    <Path
                      d={pointsToPath(currentPath)}
                      stroke={penColor}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  )}
                </Svg>
              </View>
            </GestureDetector>
          </View>
        </ViewShot>
      </GestureHandlerRootView>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  viewShot: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  gestureArea: {
    flex: 1,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default SignaturePad;
