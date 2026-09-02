// =====================================================================
// PrintingScreen - 3D printing services and fabrication (native).
// Mirrors the website's /3d-printing page: offers + workflow + a model
// library (external links) + CTAs that route to the inquiry form.
// =====================================================================
import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Printing'>;

const offers = [
  { title: 'Prototype printing', text: 'Turn a CAD file into a physical test part, enclosure, bracket, or teaching model.', meta: 'FDM · PLA / PETG' },
  { title: 'Design for print', text: 'Get help preparing geometry, tolerances, supports, and orientation before material is wasted.', meta: 'Consultancy · From NPR 2,500' },
  { title: 'Small-batch parts', text: 'Repeatable print runs for fixtures, replacement parts, classroom sets, and maker products.', meta: 'Quote by volume' },
];

const modelSites = [
  { name: 'Printables', url: 'https://www.printables.com/', blurb: 'Community models, printer profiles, and makes.', domain: 'printables.com' },
  { name: 'Thingiverse', url: 'https://www.thingiverse.com/', blurb: 'A large library of community-created printable models.', domain: 'thingiverse.com' },
  { name: 'MakerWorld', url: 'https://makerworld.com/en', blurb: 'Printable models and profiles for modern maker workflows.', domain: 'makerworld.com' },
  { name: 'MyMiniFactory', url: 'https://www.myminifactory.com/', blurb: 'Curated models for makers, miniatures, and education.', domain: 'myminifactory.com' },
  { name: 'NASA 3D Resources', url: 'https://nasa3d.arc.nasa.gov/', blurb: 'Public NASA spacecraft, science, and mission models.', domain: 'nasa3d.arc.nasa.gov' },
  { name: 'NIH 3D Print Exchange', url: 'https://3dprint.nih.gov/', blurb: 'Open biomedical and scientific 3D-printable models.', domain: '3dprint.nih.gov' },
];

export function PrintingScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="px-5 pt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">3D printing · new vertical</Text>
        <Text className="mt-2 font-display text-3xl font-bold text-ink">From a sketch to a thing you can hold.</Text>
        <Text className="mt-3 text-base leading-7 text-muted">GENUM is adding print-to-order fabrication for Nepal makers, students, product teams, and classrooms. Start with a file, a reference object, or a rough idea.</Text>
      </View>

      <View className="px-5 py-8">
        <View className="grid gap-4">
          {offers.map((offer) => (
            <View key={offer.title} className="border-t-2 border-ink bg-card p-5">
              <Text className="text-[10px] font-black uppercase tracking-widest text-navy">{offer.meta}</Text>
              <Text className="mt-3 font-display text-xl font-bold text-ink">{offer.title}</Text>
              <Text className="mt-2 text-sm leading-6 text-muted">{offer.text}</Text>
              <Pressable onPress={() => navigation.navigate('Contact')} className="mt-5 inline-flex h-12 items-center gap-1.5 rounded-full bg-navy px-5">
                <Text className="text-sm font-bold text-white">Request a quote</Text>
                <Feather name="arrow-up-right" size={14} color="#ffffff" />
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View className="mx-5 mb-8">
        <View className="grid gap-6 border-y border-line py-8">
          <View>
            <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-navy">The workflow</Text>
            <Text className="mt-3 font-display text-2xl font-bold text-ink">A useful loop, not a mystery box.</Text>
          </View>
          <View className="grid gap-4">
            {['01 · Share — Send an STL, STEP, sketch, or reference.', '02 · Review — We check fit, material, supports, and finish.', '03 · Print — You approve the estimate before the machine starts.', '04 · Learn — Get the part plus notes for the next iteration.'].map((step) => (
              <View key={step} className="border-l-2 border-gold pl-4">
                <Text className="text-sm leading-6 text-muted">{step}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Open model library */}
      <View className="mx-5 mb-8 border-t border-line pt-8">
        <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-navy">Open model library</Text>
        <Text className="mt-2 font-display text-2xl font-bold text-ink">Browse before you design.</Text>
        <Text className="mt-1 text-sm leading-6 text-muted">
          These libraries open in a separate browser tab - they do not allow embedding, so we link straight to the source.
        </Text>
        <View className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modelSites.map((site) => (
            <Pressable
              key={site.name}
              onPress={() => void Linking.openURL(site.url)}
              className="rounded-2xl border border-line bg-card p-5"
            >
              <View className="flex-row items-center justify-between">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-navy-light">
                  <Feather name="globe" size={16} color="#1e3a8a" />
                </View>
                <Feather name="external-link" size={18} color="#94a3b8" />
              </View>
              <Text className="mt-4 font-display text-lg font-bold text-ink">{site.name}</Text>
              <Text className="mt-1.5 text-sm leading-6 text-muted">{site.blurb}</Text>
              <Text className="mt-3 text-xs font-bold uppercase tracking-widest text-navy">{site.domain}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="mx-5 mb-8 rounded-2xl bg-ink p-6">
        <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-gold">Have a file?</Text>
        <Text className="mt-2 font-display text-xl font-bold text-ink">Let us review the first print.</Text>
        <Pressable onPress={() => navigation.navigate('Contact')} className="mt-4 inline-flex h-12 items-center gap-1.5 rounded-full bg-gold px-5">
          <Text className="text-sm font-bold text-ink">Request a print review</Text>
          <Feather name="arrow-up-right" size={14} color="#1e3a8a" />
        </Pressable>
      </View>
    </ScrollView>
  );
}