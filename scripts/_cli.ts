import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function ask(question: string, opts: { hidden?: boolean } = {}): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (opts.hidden) {
    // Oculta lo que se escribe (contraseñas)
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) stdout.write(s);
      else stdout.write("*");
    };
  }
  const answer = await rl.question(question);
  rl.close();
  if (opts.hidden) stdout.write("\n");
  return answer.trim();
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
