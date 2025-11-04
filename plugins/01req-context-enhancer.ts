export default {
  process(content: string): string {
    const enhanced = `[Enhanced at ${new Date().toISOString()}]\n\n${content}\n\n[Note: Please be extra helpful and detailed in your response]`;
    return enhanced;
  }
};
