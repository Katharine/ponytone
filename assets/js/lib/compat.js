"use strict";

import {getAudioContext} from "./util/audio-context";

export function isCompatible() {
    try {
        if (!getAudioContext()) {
            console.error("No audio context.");
            return false;
        }
        if (!window.AnalyserNode) {
            console.error("No AnalyserNode.");
            return false;
        }
        if (!window.RTCPeerConnection) {
            console.error("No WebRTC support.");
            return false;
        }
        if (!RTCPeerConnection.prototype.createDataChannel) {
            console.error("No RTC data channel support.");
            return false;
        }
        if (!window.Promise) {
            console.error("No native Promise support.");
            return false;
        }
        if (!window.fetch) {
            console.error("No fetch support.");
            return false;
        }
        try {
            let p = getAudioContext().decodeAudioData(1);
            if (!p instanceof Promise) {
                console.error("decodeAudioData doesn't return a Promise.");
                return false;
            }
            // shut up the bad parameter error
            p.catch(() => {
            });
        } catch (e) {
            console.error("decodeAudioData doesn't return a Promise (threw a synchronous exception instead).");
            // Browsers that don't support the Promise API throw a TypeError synchronously instead.
            return false;
        }

        // The expected return if it *does* work in both cases is "maybe". Such confidence.
        if (document.createElement('audio').canPlayType('audio/mpeg') === '') {
            console.error("The browser can't play MP3s.");
            return false;
        }
        if (document.createElement('video').canPlayType('video/mp4') === '') {
            console.error("The browser can't play MP4 video.");
            return false;
        }
    } catch(e) {
        console.error("Unexpected exception checking compatibility; probably not compatible.");
        console.log(e);
        return false;
    }
    return true;
}