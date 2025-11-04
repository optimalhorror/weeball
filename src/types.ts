export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream?: boolean;
  [key: string]: any;
}

export interface ChatCompletionResponse {
  choices?: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
  [key: string]: any;
}
