// =====================================================================
// PrintingScreen - 3D printing services and fabrication.
// =====================================================================
import React from 'react'
import { ScrollView, Text, View, Pressable } from 'react-native'
import { Feather } from '@expo/vector-icons'

const offers = [
  { title: 'Prototype printing', text: 'Turn a CAD file into a physical test part, enclosure, bracket, or teaching model.', meta: 'FDM · PLA / PETG' },
  { title: 'Design for print', text: 'Get help preparing geometry, tolerances, supports, and orientation before material is wasted.', meta: 'Consultancy · From NPR 2,500' },
  { title: 'Small-batch parts', text: 'Repeatable print runs for fixtures, replacement parts, classroom sets, and maker products.', meta: 'Quote by volume' },
]

export function PrintingScreen() {
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
            <View key={offer.title} className="border-t-2 border-ink bg-white p-5">
              <Text className="text-[10px] font-black uppercase tracking-widest text-navy">{offer.meta}</Text>
              <Text className="mt-3 font-display text-xl font-bold text-ink">{offer.title}</Text>
              <Text className="mt-2 text-sm leading-6 text-muted">{offer.text}</Text>
              <Pressable onPress={() => {}} className="mt-5 inline-flex h-12 items-center gap-1.5 rounded-full bg-navy px-5">
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

      <View className="mx-5 mb-8 rounded-2xl bg-ink p-6">
        <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-gold">Have a file?</Text>
        <Text className="mt-2 font-display text-xl font-bold text-ink">Let us review the first print.</Text>
        <Pressable onPress={() => {}} className="mt-4 inline-flex h-12 items-center gap-1.5 rounded-full bg-gold px-5">
          <Text className="text-sm font-bold text-ink">Request a print review</Text>
          <Feather name="arrow-up-right" size={14} color="#1e3a8a" />
        </Pressable>
      </View>
    </ScrollView>
  )
}