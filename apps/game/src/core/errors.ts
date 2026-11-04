// Local ring buffer of errors/notable events. Never sent anywhere automatically;
// exposed only via the "Copy device report" button.

const MAX = 60;

class ErrorRing {
  readonly items: string[] = [];
  count = 0;
  push(msg: string): void {
    this.count++;
    const line = `${new Date().toISOString().slice(11, 19)} ${msg}`.slice(0, 300);
    this.items.push(line);
    if (this.items.length > MAX) this.items.shift();
  }
  install(): void {
    window.addEventListener('error', (e) => this.push(`error: ${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`));
    window.addEventListener('unhandledrejection', (e) => this.push(`rejection: ${String(e.reason?.message ?? e.reason)}`));
  }
}

export const errors = new ErrorRing();
