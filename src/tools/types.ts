export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ToolExecutor {
  (args: any): Promise<string> | string;
}

export interface Tool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}
