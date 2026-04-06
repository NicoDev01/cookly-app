type TimingStep = {
  step: string;
  msSinceStart: number;
  msSincePrev: number;
};

export function createImportTimer(flow: string, meta: Record<string, unknown> = {}) {
  const startedAt = Date.now();
  let lastMark = startedAt;
  const steps: TimingStep[] = [];

  const mark = (step: string, details: Record<string, unknown> = {}) => {
    const now = Date.now();
    const payload: TimingStep = {
      step,
      msSinceStart: now - startedAt,
      msSincePrev: now - lastMark,
    };
    steps.push(payload);
    lastMark = now;

    console.log(`[ImportTiming][${flow}] ${step}`, {
      ...meta,
      ...payload,
      ...details,
    });
  };

  const summary = (details: Record<string, unknown> = {}) => {
    const totalMs = Date.now() - startedAt;
    console.log(`[ImportTiming][${flow}] summary`, {
      ...meta,
      totalMs,
      steps,
      ...details,
    });
    return { totalMs, steps };
  };

  return { mark, summary };
}
