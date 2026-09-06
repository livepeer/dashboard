/** A network-free adapter double. Unconfigured effects reject instead of succeeding silently. */
export function createEffectRecorder<Input, Output>() {
  const calls: Input[] = [];
  let implementation: ((input: Input) => Output | Promise<Output>) | undefined;
  return {
    get calls(): readonly Input[] {
      return calls.slice();
    },
    respondWith(handler: (input: Input) => Output | Promise<Output>) {
      implementation = handler;
    },
    async invoke(input: Input): Promise<Output> {
      calls.push(structuredClone(input));
      if (!implementation)
        throw new Error("Unexpected synthetic external effect");
      return implementation(input);
    },
    reset() {
      calls.length = 0;
      implementation = undefined;
    },
  };
}

/** Only use synthetic payloads; do not feed production tokens into recorders. */
export function createMockExternalEffects() {
  const effects = {
    email: createEffectRecorder<unknown, unknown>(),
    audience: createEffectRecorder<unknown, unknown>(),
    billing: createEffectRecorder<unknown, unknown>(),
    key: createEffectRecorder<unknown, unknown>(),
    device: createEffectRecorder<unknown, unknown>(),
    mint: createEffectRecorder<unknown, unknown>(),
  };
  return {
    ...effects,
    assertNoCalls() {
      if (Object.values(effects).some((effect) => effect.calls.length)) {
        throw new Error("Denied operation attempted an external effect");
      }
    },
    reset() {
      Object.values(effects).forEach((effect) => effect.reset());
    },
  };
}
