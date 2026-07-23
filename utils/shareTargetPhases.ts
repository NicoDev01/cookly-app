export type ShareTargetPhase = 'analyzing' | 'extrahieren' | 'importieren';

export const MIN_SHARE_TARGET_PHASE_MS = 800;

type PhaseSequencerOptions = {
  onPhase?: (phase: ShareTargetPhase) => void;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const createPhaseSequencer = ({
  onPhase,
  now = () => Date.now(),
  wait = defaultWait,
}: PhaseSequencerOptions = {}) => {
  let lastPhaseStartedAt: number | null = null;

  const waitForCurrentPhase = async () => {
    if (lastPhaseStartedAt === null) return;
    const elapsed = now() - lastPhaseStartedAt;
    const remaining = MIN_SHARE_TARGET_PHASE_MS - elapsed;
    if (remaining > 0) {
      await wait(remaining);
    }
  };

  return {
    async show(phase: ShareTargetPhase) {
      await waitForCurrentPhase();
      onPhase?.(phase);
      lastPhaseStartedAt = now();
    },
    async finish() {
      await waitForCurrentPhase();
      lastPhaseStartedAt = null;
    },
  };
};
