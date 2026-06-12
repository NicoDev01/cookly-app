type BackButtonOverride = () => void | Promise<void>;

const overrides: BackButtonOverride[] = [];

export function registerBackButtonOverride(handler: BackButtonOverride): () => void {
  overrides.push(handler);

  return () => {
    const index = overrides.lastIndexOf(handler);
    if (index >= 0) {
      overrides.splice(index, 1);
    }
  };
}

export function getActiveBackButtonOverride(): BackButtonOverride | undefined {
  return overrides[overrides.length - 1];
}
