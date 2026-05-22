const REQUIRED_RESPONSES = 10;
let serverTimes: number[] = [];
let timeOffset: number | null = null;

export async function syncTime(): Promise<void> {
  serverTimes = [];
  timeOffset = null;
  return new Promise((resolve) => {
    async function getServerTime() {
      try {
        const start = Date.now();
        const response = await fetch(`/api/ntp?t=${start}`);
        const text = await response.text();
        const parts = text.split(':').map((x) => parseInt(x, 10));
        if (parts.length === 2) {
          let [offset, originalTime] = parts;
          const delay = (Date.now() - originalTime) / 2;
          offset -= delay;
          serverTimes.push(offset);
        }
      } catch (e) {
        console.error("NTP sync request failed", e);
      }

      if (serverTimes.length >= REQUIRED_RESPONSES) {
        timeOffset = Math.round(serverTimes.reduce((a, v) => a + v, 0) / serverTimes.length);
        console.log("NTP offset synced:", timeOffset);
        resolve();
      } else {
        setTimeout(getServerTime, 50);
      }
    }
    getServerTime();
  });
}

export function fixedTimestamp(): number {
  const ts = Date.now();
  if (timeOffset === null) {
    return ts;
  }
  return ts + timeOffset;
}
