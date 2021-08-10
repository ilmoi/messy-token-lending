export function assert(condition: boolean, message?: string) {
  if (!condition) {
    console.log(Error().stack + ':main.ts');
    throw message || 'Assertion failed';
  }
}