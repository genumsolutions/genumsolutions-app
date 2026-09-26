// =====================================================================
// productMedia — U-47v4: mirrors genumsolutions-website/lib/product-media.ts
// (READ-ONLY source of the mapping). The website falls back to a themed
// photo per category when a product has no image; the app used to show a
// gray box icon instead, which read as "broken" next to the website
// (owner: cars "not proper like in the website"). Same URLs, same
// categories, same default.
// =====================================================================

const mediaByCategory: Record<string, { src: string; alt: string }> = {
  Robotics: {
    src: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=85",
    alt: "Small educational robot on a workbench",
  },
  Electronics: {
    src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
    alt: "Electronic circuit board close-up",
  },
  Learning: {
    src: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1200&q=85",
    alt: "Robotics team working on a prototype",
  },
  Components: {
    src: "https://images.unsplash.com/photo-1553406830-ef2513450d76?auto=format&fit=crop&w=1200&q=85",
    alt: "Motors and electronics components",
  },
  "AI + IoT": {
    src: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=85",
    alt: "Team collaborating around connected technology",
  },
  "3D Printing": {
    src: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=85",
    alt: "Engineer working on a fabrication prototype",
  },
  "Project Solutions": {
    src: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=85",
    alt: "Engineer working on a technology prototype",
  },
  "Controllers & Boards": {
    src: "https://images.unsplash.com/photo-1553406830-ef2513450d76?auto=format&fit=crop&w=1200&q=85",
    alt: "Development boards and electronic components on a workbench",
  },
  "Motors & Motion": {
    src: "https://images.unsplash.com/photo-1553406830-ef2513450d76?auto=format&fit=crop&w=1200&q=85",
    alt: "Small motors and motion components",
  },
  "Sensors & Modules": {
    src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
    alt: "Electronic sensor modules and circuit board",
  },
  "Power & Charging": {
    src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
    alt: "Power and electronic components on a circuit board",
  },
  "Mechanical Parts": {
    src: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=85",
    alt: "Mechanical workshop parts and tools",
  },
  "Connectors & Cables": {
    src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=85",
    alt: "Organized electronic cables and connectors",
  },
  "Tools & Fabrication": {
    src: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1200&q=85",
    alt: "Workshop tools for electronics and fabrication",
  },
  "Pre-packaged Kits": {
    src: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1200&q=85",
    alt: "Students building a robotics project kit",
  },
  "3D Printing Materials": {
    src: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=85",
    alt: "3D printer filament and printed prototype parts",
  },
  "Robot Cars": {
    src: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=85",
    alt: "Educational robot car platform on a workbench",
  },
  "Communication Modules": {
    src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
    alt: "Wireless communication and electronics modules",
  },
  "Displays & Interfaces": {
    src: "https://images.unsplash.com/photo-1553406830-ef2513450d76?auto=format&fit=crop&w=1200&q=85",
    alt: "Small electronic display and controller components",
  },
};

export function getProductMedia(category: string): {
  src: string;
  alt: string;
} {
  return (
    mediaByCategory[category] ?? {
      src: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=85",
      alt: "Educational robot on a workbench",
    }
  );
}
