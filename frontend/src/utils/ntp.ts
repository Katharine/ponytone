const REQUIRED_RESPONSES = 12;
const MAX_ATTEMPTS = 25;

interface NTPSample {
  offset: number;
  rtt: number;
}

let timeOffset: number | null = null;
let isSyncSuspended = false;


// Temporary states for the active sync session
let currentSamples: NTPSample[] = [];
let attemptsCount = 0;
let activeSocket: WebSocket | null = null;
let ntpResolver: (() => void) | null = null;
let ntpTimeoutId: any = null;

/**
 * Suspends or resumes periodic background time synchronization.
 * Typically suspended during active song gameplay to prevent network/CPU jitter.
 */
export function suspendSync(suspended: boolean): void {
  isSyncSuspended = suspended;
  console.log(`NTP sync periodic checks suspended: ${suspended}`);
  // If resuming, and we don't have an offset yet, trigger an immediate sync
  if (!suspended && timeOffset === null && activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    syncTime(activeSocket).catch((err) => console.error("Immediate syncTime failed:", err));
  }
}

/**
 * Handles the "ntp_pong" message received from the WebSocket.
 */
export function handleNtpPong(data: { time: number; originalTime: number }): void {
  if (!activeSocket || ntpResolver === null) return;

  const end = Date.now();
  const rtt = end - data.originalTime;
  
  // Calculate NTP offset: serverOffset - (RTT / 2)
  const offset = data.time - Math.round(rtt / 2);

  currentSamples.push({ offset, rtt });

  if (currentSamples.length >= REQUIRED_RESPONSES || attemptsCount >= MAX_ATTEMPTS) {
    finalizeSync();
  } else {
    // Stagger subsequent pings by 50ms to avoid packet burst queueing delays
    ntpTimeoutId = setTimeout(sendPing, 50);
  }
}

function sendPing(): void {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    finalizeSync();
    return;
  }
  
  attemptsCount++;
  activeSocket.send(JSON.stringify({
    action: "ntp_ping",
    time: Date.now(),
  }));
}

function finalizeSync(): void {
  if (ntpTimeoutId) {
    clearTimeout(ntpTimeoutId);
    ntpTimeoutId = null;
  }

  if (currentSamples.length > 0) {
    // Sort samples by Round-Trip Time (RTT) ascending.
    // Lower RTT correlates with minimal queueing delay and symmetric paths.
    currentSamples.sort((a, b) => a.rtt - b.rtt);

    // Keep the best subset (top 50%, with a minimum of 5 samples if available)
    const subsetSize = Math.max(5, Math.min(currentSamples.length, Math.ceil(currentSamples.length / 2)));
    const bestSamples = currentSamples.slice(0, subsetSize);

    // Compute the median offset of the best samples to completely isolate asymmetric skews
    const bestOffsets = bestSamples.map((s) => s.offset).sort((a, b) => a - b);
    const midIndex = Math.floor(bestOffsets.length / 2);
    
    let newOffset = 0;
    if (bestOffsets.length % 2 === 0) {
      newOffset = Math.round((bestOffsets[midIndex - 1] + bestOffsets[midIndex]) / 2);
    } else {
      newOffset = bestOffsets[midIndex];
    }

    timeOffset = newOffset;
    console.log(
      `NTP sync complete (via WS). Offset: ${timeOffset}ms. ` +
      `Min RTT: ${currentSamples[0].rtt}ms, Max RTT: ${currentSamples[currentSamples.length - 1].rtt}ms. ` +
      `Samples used: ${bestSamples.length}/${currentSamples.length}`
    );
  } else {
    console.warn("NTP sync failed: no valid samples could be collected");
  }

  const resolve = ntpResolver;
  ntpResolver = null;
  if (resolve) resolve();
}

/**
 * Initiates the NTP clock synchronization sequence over the provided WebSocket.
 */
export async function syncTime(socket: WebSocket): Promise<void> {
  // Save socket reference for periodic background synchronization
  activeSocket = socket;

  // Skip sync if the document is hidden, since browser background throttling
  // introduces high network/timer delays, producing extremely inaccurate RTTs.
  if (typeof document !== "undefined" && document.hidden) {
    console.log("NTP sync skipped: document is hidden");
    return;
  }

  // If a sync is already running, wait for it
  if (ntpResolver !== null) {
    return;
  }

  currentSamples = [];
  attemptsCount = 0;

  return new Promise((resolve) => {
    ntpResolver = resolve;
    sendPing();
  });
}

/**
 * Returns a synchronized Unix millisecond timestamp by applying the calculated NTP offset.
 */
export function fixedTimestamp(): number {
  const ts = Date.now();
  if (timeOffset === null) {
    return ts;
  }
  return ts + timeOffset;
}

// Automatically start background sync interval on module load (browser context only)
if (typeof window !== "undefined") {
  // Sync every 2 minutes (120,000 ms)
  setInterval(() => {
    if (
      !isSyncSuspended &&
      activeSocket &&
      activeSocket.readyState === WebSocket.OPEN &&
      typeof document !== "undefined" &&
      !document.hidden
    ) {
      console.log("NTP periodic background sync triggered");
      syncTime(activeSocket).catch((err) =>
        console.error("Periodic background NTP sync failed:", err)
      );
    }
  }, 120000);
}
