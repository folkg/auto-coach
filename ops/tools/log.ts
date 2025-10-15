export function log(message: string): void {
  console.log(`\n✓ ${message}`);
}

export function logStep(step: string, message: string): void {
  console.log(`\n[${step}] ${message}`);
}

export function logError(message: string): void {
  console.error(`\n✗ ${message}`);
}

export function logSuccess(message: string): void {
  console.log(`\n🎉 ${message}`);
}

export function logWarning(message: string): void {
  console.warn(`\n⚠️  ${message}`);
}
