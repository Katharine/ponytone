// based on NTP.js, https://jehiah.cz/a/ntp-for-javascript
// This is much dumber than actual NTP, and does not in fact get the same time as the server.
// However, it is sufficient to get every client's clock in sync with every other client, which was the actual aim.

const REQUIRED_RESPONSES = 10;

let serverTimes: number[] = [];
let timeOffset: number = null;

async function getServerTime(): Promise<void> {
    let response = await fetch(`/ntp?t=${Date.now()}`);
    let text = await response.text();

    let [offset, originalTime] = text.split(':').map((x) => parseInt(x, 10));
    let delay = (Date.now() - originalTime) / 2;
    offset -= delay;
    serverTimes.push(offset);
    if (serverTimes.length >= REQUIRED_RESPONSES) {
        console.log(serverTimes);
        // Set the offset to our average
        timeOffset = Math.round(serverTimes.reduce((a, v) => a + v, 0) / serverTimes.length);
    } else {
        getServerTime();
    }
}

export function syncTime(): void {
    serverTimes = [];
    getServerTime();
}

export function fixedTimestamp(): number {
    let ts = Date.now();
    if (timeOffset === null) {
        console.warn("Using uncorrected timestamp; server sync incomplete.");
        return ts;
    }
    return ts + timeOffset;
}
