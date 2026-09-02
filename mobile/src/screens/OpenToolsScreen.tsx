// =====================================================================
// OpenToolsScreen - directory of open-source tools the team relies on.
// =====================================================================
import React, { useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

type Tool = { group: string; name: string; description: string; href: string }

const tools: Tool[] = [
  { group: 'CAD & 3D', name: 'OpenSCAD', description: 'Parametric 3D design for printable parts.', href: 'https://openscad.org/' },
  { group: 'CAD & 3D', name: 'FreeCAD', description: 'Open-source mechanical CAD for precise models.', href: 'https://www.freecad.org/' },
  { group: 'Slicing', name: 'PrusaSlicer', description: 'Prepare STL and 3MF files for FDM printing.', href: 'https://www.prusa3d.com/page/prusaslicer_424/' },
  { group: 'Electronics', name: 'KiCad', description: 'Design schematics and PCBs without a subscription.', href: 'https://www.kicad.org/' },
  { group: 'Robotics', name: 'Arduino IDE', description: 'Write and upload firmware for classroom boards.', href: 'https://www.arduino.cc/en/software/' },
  { group: 'Robotics', name: 'PlatformIO', description: 'A professional embedded development workflow.', href: 'https://platformio.org/' },
  { group: 'Simulation', name: 'Wokwi', description: 'Simulate Arduino and ESP32 projects in the browser.', href: 'https://wokwi.com/' },
  { group: 'Images', name: 'Wikimedia Commons', description: 'Reusable media and diagrams with license details.', href: 'https://commons.wikimedia.org/' },
]

export function OpenToolsScreen() {
  const [filter, setFilter] = useState('All')
  const groups = ['All', ...Array.from(new Set(tools.map((t) => t.group)))]
  const visible = tools.filter((t) => filter === 'All' || t.group === filter)

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="px-5 pt-6">
        <Text className="text-[10px] font-black uppercase tracking-widest text-navy">Open tools</Text>
        <Text className="mt-2 font-display text-3xl font-bold text-ink">Free tools we rely on.</Text>
        <Text className="mt-3 text-base leading-7 text-muted">A small directory of open-source software for CAD, printing, electronics, and simulation.</Text>
      </View>

      <View className="px-5 pt-4">
        <View className="flex-row flex-wrap gap-2">
          {groups.map((g) => (
            <Pressable
              key={g}
              onPress={() => setFilter(g)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${filter === g ? 'bg-navy text-white' : 'border border-line bg-card text-muted'}`}
            >
              {g}
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(t) => t.name}
        className="px-5 pt-6"
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View className="mb-4 rounded-2xl border-t-2 border-navy bg-card p-5">
            <Text className="text-[10px] font-black uppercase tracking-widest text-navy">{item.group}</Text>
            <Text className="mt-3 font-display text-xl font-bold text-ink">{item.name}</Text>
            <Text className="mt-2 text-sm leading-6 text-muted">{item.description}</Text>
            <Pressable onPress={() => {}} className="mt-5 inline-flex items-center gap-1.5">
              <Text className="text-sm font-bold text-navy underline decoration-gold underline-offset-4">Open tool ↗</Text>
            </Pressable>
          </View>
        )}
      />
    </ScrollView>
  )
}