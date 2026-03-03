module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@app': './src/app',
          '@presentation': './src/presentation',
          '@screens': './src/presentation/screens',
          '@components': './src/presentation/components',
          '@context': './src/presentation/context',
          '@navigation': './src/presentation/navigation',
          '@domain': './src/domain',
          '@data': './src/data',
          '@native': './src/native',
          '@infrastructure': './src/infrastructure',
          '@theme': './src/theme',
          '@config': './src/config',
          '@types': './src/types',
          '@assets': './src/assets',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
