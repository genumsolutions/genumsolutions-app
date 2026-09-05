// =====================================================================
// MenuScreen - the Menu tab. A compact destinations list that renders in
// the same space as Home / Shop / Cart (between the brand header and the
// bottom tab bar), so it never blocks or overlays the tabs.
//
// It only carries pages that have no tab of their own. Identity, theme,
// sign-out and app-update live on the Account screen / header instead, so
// nothing is shown twice.
// =====================================================================
import React from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList, 'Main'>;
type IconName = ComponentProps<typeof Feather>['name'];

type Dest = {
  icon: IconName;
  label: string;
  screen: 'Services' | 'Projects' | 'Journal' | 'Printing' | 'OpenTools' | 'Tools' | 'About' | 'Contact';
};

const EXPLORE: Dest[] = [
  { icon: 'briefcase', label: 'Services', screen: 'Services' },
  { icon: 'layers', label: 'Projects', screen: 'Projects' },
  { icon: 'book-open', label: 'Journal', screen: 'Journal' },
  { icon: 'corner-down-left', label: '3D Printing', screen: 'Printing' },
  { icon: 'tool', label: 'Open Tools', screen: 'OpenTools' },
];

const COMPANY: Dest[] = [
  { icon: 'cpu', label: 'Tools & IoT', screen: 'Tools' },
  { icon: 'info', label: 'About', screen: 'About' },
  { icon: 'phone', label: 'Contact', screen: 'Contact' },
];

export function MenuScreen() {
  const navigation = useNavigation<RootNav>();
  const { isAdmin } = useApp();

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingVertical: 8 }}>
      <MenuGroup title="Explore">
        {EXPLORE.map((d) => (
          <MenuItem key={d.label} icon={d.icon} label={d.label} onPress={() => navigation.push(d.screen)} />
        ))}
      </MenuGroup>

      <MenuGroup title="Company">
        {COMPANY.map((d) => (
          <MenuItem key={d.label} icon={d.icon} label={d.label} onPress={() => navigation.push(d.screen)} />
        ))}
        <MenuItem icon="shield" label="Privacy Policy" onPress={() => navigation.push('Legal', { doc: 'privacy' })} />
        <MenuItem icon="file-text" label="Terms of Service" onPress={() => navigation.push('Legal', { doc: 'terms' })} />
      </MenuGroup>

      {isAdmin ? (
        <MenuGroup title="Admin">
          <MenuItem icon="settings" label="Admin Dashboard" onPress={() => navigation.push('Admin')} />
        </MenuGroup>
      ) : null}
    </ScrollView>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="pt-2">
      <Text className="px-5 pb-1 text-[11px] font-black uppercase tracking-widest text-border">
        {title}
      </Text>
      {children}
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-3 flex-row items-center rounded-lg px-2.5 py-2.5 active:bg-mist"
    >
      <Feather name={icon} size={16} color="#64748b" />
      <Text className="ml-3 text-sm font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}