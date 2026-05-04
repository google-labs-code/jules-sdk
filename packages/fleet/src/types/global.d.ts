// Ambient shims to help local typecheck when node types are not installed.
declare var process: {
  env: { [key: string]: string | undefined };
  exit(code?: number): never;
  on(event: string, listener: (...args: any[]) => void): this;
};

declare var Buffer: {
  from(input: string, encoding?: string): { toString(encoding?: string): string };
};

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

export {};
