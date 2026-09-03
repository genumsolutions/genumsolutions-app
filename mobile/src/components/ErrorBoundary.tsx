// =====================================================================
// ErrorBoundary — catches render errors in a subtree so a single failing
// screen can't crash the whole app. Shows a friendly fallback with a
// "Try again" button that resets the boundary.
// =====================================================================
import React, { Component, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

type Props = {
  children: ReactNode
  /** Screen name used in error logs, e.g. "Home". */
  label?: string
}

type State = {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error) {
    const tag = this.props.label ? ` (${this.props.label})` : ''
    console.error(`ErrorBoundary${tag} caught:`, error)
  }

  private reset = () => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center bg-mist p-6">
          <Text className="font-display text-lg font-bold text-ink">
            {this.props.label ? `${this.props.label} hit a snag` : 'Something went wrong'}
          </Text>
          <Text className="mt-2 max-w-sm text-center text-sm leading-5 text-muted">
            {this.state.message || 'An unexpected error occurred.'}
          </Text>
          <Pressable onPress={this.reset} className="mt-5 rounded-full bg-navy px-6 py-3">
            <Text className="text-sm font-black text-white">Try again</Text>
          </Pressable>
        </View>
      )
    }
    return this.props.children
  }
}