export interface ContextPlugin {
  process: (context: string) => string;
}
