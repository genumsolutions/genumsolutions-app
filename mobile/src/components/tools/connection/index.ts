// The U-68 connection model — pure decisions, no I/O, no React.
// Design doc: guide/PLAN-2026-10-02-CONTROL-PANEL-CONNECTION-REBUILD.md — NOT
// in the repo. These modules are the surviving record of those decisions.
export * from "./methods";
export * from "./routerList";
export * from "./commands";
export * from "./dial";

// The UI. Exported from here so a screen imports ONE thing; it is kept out of
// the pure modules so nothing in the model can reach for React.
export {
  ConnectionSection,
  type ConnectionSectionProps,
} from "./ConnectionSection";
export {
  ActionButton,
  ConnectionCard,
  InlineMessage,
  type CardTone,
} from "./ConnectionCard";
export * from "./discovery";
