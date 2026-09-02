// =====================================================================
// Joystick — native virtual joystick for car driving.
//
// Matches the website's RoboCarControl Joystick. A circular touch area
// with a draggable knob that reports normalized x/y values in [-1, 1].
// Uses Animated.Value for smooth 60fps knob movement without re-renders.
// =====================================================================
import React, { useRef } from 'react'
import { Animated, PanResponder, StyleSheet, View } from 'react-native'

type Props = {
  /** Called with normalized x/y (-1..1) as the knob moves. */
  onMove: (x: number, y: number) => void
  /** When true, touch input is ignored and the knob stays centered. */
  disabled: boolean
  /** Diameter of the joystick in points (default 144). */
  size?: number
}

const KNOB_SIZE = 48

export function Joystick({ onMove, disabled, size = 144 }: Props) {
  const radius = size / 2
  const knobMaxRadius = radius - KNOB_SIZE / 2 - 4

  const knobX = useRef(new Animated.Value(0)).current
  const knobY = useRef(new Animated.Value(0)).current

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderMove: (_, gestureState) => {
        // Clamp to circular boundary
        let dx = gestureState.dx
        let dy = gestureState.dy
        const dist = Math.hypot(dx, dy)
        if (dist > knobMaxRadius) {
          dx = (dx / dist) * knobMaxRadius
          dy = (dy / dist) * knobMaxRadius
        }
        // Move knob visually (no re-render, 60fps native driver)
        knobX.setValue(dx)
        knobY.setValue(dy)
        // Report normalized values to parent
        onMove(dx / knobMaxRadius, dy / knobMaxRadius)
      },
      onPanResponderRelease: () => {
        // Snap back to center
        Animated.parallel([
          Animated.spring(knobX, { toValue: 0, useNativeDriver: true, friction: 5 }),
          Animated.spring(knobY, { toValue: 0, useNativeDriver: true, friction: 5 }),
        ]).start()
        onMove(0, 0)
      },
      onPanResponderTerminate: () => {
        knobX.setValue(0)
        knobY.setValue(0)
        onMove(0, 0)
      },
    }),
  ).current

  return (
    <View
      style={[styles.base, { width: size, height: size, borderRadius: size / 2 }]}
      {...(disabled ? {} : panResponder.panHandlers)}
    >
      {/* Center dot */}
      <View style={styles.centerDot} />
      {/* Draggable knob */}
      <Animated.View
        style={[
          styles.knob,
          {
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: KNOB_SIZE / 2,
            left: radius - KNOB_SIZE / 2,
            top: radius - KNOB_SIZE / 2,
            transform: [{ translateX: knobX }, { translateY: knobY }],
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  centerDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    left: '50%',
    top: '50%',
    marginLeft: -2,
    marginTop: -2,
  },
  knob: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#1e3a8a',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
})
