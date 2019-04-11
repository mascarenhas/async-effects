/**
 * Returns a promise the resolves after a delay
 * @param delay delay in miliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => resolve(), ms);
  });
}
