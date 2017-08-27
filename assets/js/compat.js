"use strict";

let _decodeAudioPromise = null;
export function isCompatible() {
    try {
        let audioContext = window.AudioContext || window.webkitAudioContext;
        if (!audioContext) {
            console.error("No audio context.");
            return false;
        }
        if (!window.AnalyserNode) {
            console.error("No AnalyserNode.");
            return false;
        }
        if (!AnalyserNode.prototype.getFloatTimeDomainData) {
            console.error("No AnalyserNode.getFloatTimeDomainData.");
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
        // This is convoluted because there is a bound in Chrome on how many AudioContexts we can ever create,
        // and closing them doesn't seem to actually work.
        if (_decodeAudioPromise === null) {
            try {
                let p = new audioContext().decodeAudioData(1);
                if (!p instanceof Promise) {
                    console.error("decodeAudioData doesn't return a Promise.");
                    _decodeAudioPromise = true;
                    return false;
                }
                // shut up the bad parameter error
                p.catch(() => {
                });
            } catch (e) {
                console.error("decodeAudioData doesn't return a Promise (threw a synchronous exception instead).");
                _decodeAudioPromise = false;
                // Browsers that don't support the Promise API throw a TypeError synchronously instead.
                return false;
            }
            _decodeAudioPromise = true;
        } else if (_decodeAudioPromise === false) {
            console.error("Audio decoding doesn't support the Promise API.");
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