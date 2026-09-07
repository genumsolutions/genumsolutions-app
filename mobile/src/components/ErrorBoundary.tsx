// =====================================================================
// ErrorBoundary — catches render errors in a subtree so a single failing
// screen can't crash the whole app. Shows a friendly fallback with a
// "Try again" button that resets the boundary.
// =====================================================================
import React, { Component, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

function trimFirstLine(stack: string): string {
  const line = stack.split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('at '))
  return line || stack.slice(0, 80)
}

type Props = {
  children: ReactNode
  /** Screen name used in error logs, e.g. "Home". */
  label?: string
}

type State = {
  hasError: boolean
  message: string
  componentStack: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', componentStack: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error), componentStack: '' }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    const tag = this.props.label ? ` (${this.props.label})` : ''
    console.error(
      `ErrorBoundary${tag} caught:`,
      error,
      info?.componentStack ? `\ncomponent stack:\n${info.componentStack}` : '',
    )
    if (info?.componentStack) {
      this.setState({ componentStack: info.componentStack })
    }
  }

  private reset = () => {
    this.setState({ hasError: false, message: '', componentStack: '' })
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
          {!!this.state.componentStack && (
            <Text className="mt-3 max-w-sm text-center text-[10px] leading-4 text-muted/70" numberOfLines={3}>
              in {trimFirstLine(this.state.componentStack)}
            </Text>
          )}
          <Pressable onPress={this.reset} className="mt-5 rounded-full bg-navy px-6 py-3">
            <Text className="text-sm font-black text-white">Try again</Text>
          </Pressable>
        </View>
      )
    }
    return this.props.children
  }
}