// Reusable branded header for screens.
// Uses tailwind utility classes (NativeWind) styled with the website theme tokens.
import React from 'react';
import { Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
};

export function BrandHeader({ title, subtitle }: Props) {
  return (
    <View className="bg-navy px-5 pb-5 pt-4">
      <Text className="font-bold text-2xl text-white">{title}</Text>
      {subtitle ? (
        <Text className="mt-1 text-sm text-navy-light">{subtitle}</Text>
      ) : null}
    </View>
  );
}
