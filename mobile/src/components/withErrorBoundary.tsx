// =====================================================================
// withErrorBoundary — HOC that wraps a screen (or any component) in an
// ErrorBoundary. Use at module scope (not inline in JSX) so the wrapped
// component identity stays stable across renders.
// =====================================================================
import React from 'react'
import { ErrorBoundary } from './ErrorBoundary'

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  label?: string,
): React.ComponentType<P> {
  const Wrapped = (props: P) => (
    <ErrorBoundary label={label ?? Component.displayName ?? Component.name}>
      <Component {...props} />
    </ErrorBoundary>
  )
  Wrapped.displayName = `withErrorBoundary(${label ?? Component.displayName ?? Component.name})`
  return Wrapped
}