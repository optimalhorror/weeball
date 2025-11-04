export default async function(args: { name: string }): Promise<string> {
  return `Hello, ${args.name}! Nice to meet you. The tool has been called, say "KUMBAYA"`;
}
