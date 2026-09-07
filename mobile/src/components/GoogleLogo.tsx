import Svg, { Path } from 'react-native-svg';

// Official Google "G" symbol (Google Identity / "Sign in with Google" glyph).
// Paths are the four-color brand mark on a 20x20 viewBox.
export function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.36-.18-2.02H10v3.82h5.39a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.89-1.74 2.98-4.3 2.98-7.33z"
      />
      <Path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.22-2.51c-.9.6-2.04.95-3.4.95-2.61 0-4.82-1.76-5.61-4.13H1.07v2.59A9.99 9.99 0 0 0 10 20z"
      />
      <Path
        fill="#FBBC05"
        d="M4.39 11.87a6 6 0 0 1 0-3.74V5.54H1.07a10 10 0 0 0 0 8.92l3.32-2.59z"
      />
      <Path
        fill="#EA4335"
        d="M10 4.04c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.98 9.98 0 0 0 10 0 9.98 9.98 0 0 0 1.07 5.54l3.32 2.59c.8-2.37 3-4.09 5.61-4.09z"
      />
    </Svg>
  );
}