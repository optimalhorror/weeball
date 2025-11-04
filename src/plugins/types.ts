export interface Message {
  role: string;
  content: string;
}

export interface ContextPlugin {
  process: (messages: Message[]) => Message[];
}
