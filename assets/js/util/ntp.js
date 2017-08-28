"use strict";
// based on NTP.js, https://jehiah.cz/a/ntp-for-javascript
// This is much dumber than actual NTP, and does not in fact get the same time as the server.
// However, it is sufficient to get every client's clock in sync with every other client, which was the actual aim.

const REQUIRED_RESPONSES = 10;

let serverTimes = [];
let timeOffset = null;

function getServerTime() {
    let start = Date.now();
    fetch(`/ntp?t=${Date.now()}`)
        .then((response) => response.text())
        .then((response) => {
            let [offset, originalTime] = response.split(':').map((x) => parseInt(x, 10));
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
        });
}

export function syncTime() {
    serverTimes = [];
    getServerTime();
}

export function fixedTimestamp() {
    let ts = Date.now();
    if (timeOffset === null) {
        console.warn("Using uncorrected timestamp; server sync incomplete.");
        return ts;
    }
    return ts + timeOffset;
}
