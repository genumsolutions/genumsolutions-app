// =====================================================================
// navigationRef - module-level container ref so deep links (eSewa / Khalti
// return trips via genumsolutions://) can navigate from outside the tree.
// =====================================================================
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
) {
  if (navigationRef.isReady()) {
    // Cast needed: container ref type is generic over the full param list.
    (navigationRef.navigate as (n: string, p?: unknown) => void)(name as string, params);
  }
}