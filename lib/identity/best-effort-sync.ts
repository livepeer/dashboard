export async function runBestEffortIdentitySync<T>(
  operation: () => Promise<T>,
  onFailure: (error: unknown) => void
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    onFailure(error);
    return null;
  }
}
