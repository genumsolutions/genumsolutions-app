// =====================================================================
// JournalScreen - tutorials, field notes, and industry observations.
// =====================================================================
import React from 'react'
import { ScrollView, Text, View, Pressable } from 'react-native'
import { Feather } from '@expo/vector-icons'

const posts = [
  { tag: 'Tutorial · Robotics', title: 'Your first ESP32 project: a calmer way to begin', text: 'A practical starting point for wiring, flashing, and debugging without the mystery.' },
  { tag: 'Field note · AI', title: 'Edge AI is useful when the decision needs to stay close', text: 'A grounded look at local inference, latency, privacy, and why not every sensor needs a cloud dashboard.' },
  { tag: 'Learning · Nepal', title: 'How to teach automation without making promises it cannot keep', text: 'A human-centered workshop format built around critical thinking, testing, and responsible use.' },
]

export function JournalScreen() {
  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="px-5 pt-6">
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Journal · signals and practice</Text>
        <Text className="mt-2 font-display text-3xl font-bold text-ink">Notes from the workbench.</Text>
        <Text className="mt-3 text-base leading-7 text-muted">Tutorials, field notes, and industry observations for people building a more useful future.</Text>
      </View>

      <View className="px-5 py-8">
        <View className="grid gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <View key={post.title} className="border-t-2 border-ink bg-white p-5">
              <Text className="text-[10px] font-black uppercase tracking-widest text-navy">{post.tag}</Text>
              <Text className="mt-3 font-display text-xl font-bold text-ink">{post.title}</Text>
              <Text className="mt-2 text-sm leading-6 text-muted">{post.text}</Text>
              <Pressable onPress={() => {}} className="mt-5 inline-flex items-center gap-1.5">
                <Text className="text-sm font-bold text-navy underline decoration-gold underline-offset-4">Get in touch about this ↗</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      <View className="mx-5 mb-8 rounded-2xl border-y border-line bg-mist p-5">
        <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-navy">Trend brief · August 2026</Text>
        <Text className="mt-3 font-display text-xl font-bold text-ink">The useful future is more human than the hype cycle.</Text>
        <Text className="mt-3 text-sm leading-6 text-muted">
          The World Economic Forum points to technology change and skills gaps as major forces through 2030. The International Federation of Robotics emphasizes that robots automate tasks, while skills development and training help people capture the benefits. UNESCO's digital education guidance keeps human agency, critical thinking, and ethics at the center of AI learning. That is the standard we are building toward.
        </Text>
        <View className="mt-4 flex-row flex-wrap gap-4">
          <Text className="text-xs font-bold text-navy underline underline-offset-4">WEF Future of Jobs 2025 ↗</Text>
          <Text className="text-xs font-bold text-navy underline underline-offset-4">IFR robotics research ↗</Text>
          <Text className="text-xs font-bold text-navy underline underline-offset-4">UNESCO digital education ↗</Text>
        </View>
      </View>
    </ScrollView>
  )
}