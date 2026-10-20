// =====================================================================
// projectService - project-package predicate over the shared `products`
// Supabase table. The website's /projects page shows Project packages and
// Robot Cars from the SAME products table (see website's ProjectsCatalog),
// so the app shows the same data.
//
// U-119b (2026-10-21): getProjects() and the Project interface it was the
// only user of are GONE — zero importers anywhere in mobile/src (only
// isProjectPackage is imported, by AdminScreen). Their removal also orphaned
// the getProductsFromSupabase and Product imports, so those went too. What
// stays is what is read.
// =====================================================================

export function isProjectPackage(p: {
  productType?: string | null;
  category?: string | null;
}): boolean {
  return (
    p.productType === "Project package" ||
    p.category === "Robot Cars" ||
    p.category === "Pre-packaged Kits"
  );
}
