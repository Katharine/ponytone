"use strict";

let MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
let GOOD_ENOUGH_CORRELATION = 0.9; // this is the "bar" for how close a correlation needs to be

export function autoCorrelate(buf, sampleRate) {
    let size = buf.length;
    let max_samples = Math.floor(size/2);
    let bestOffset = -1;
    let bestCorrelation = 0;
    let rms = 0;
    let foundGoodCorrelation = false;
    let correlations = new Array(max_samples);

    for (let i=0;i<size;i++) {
        let val = buf[i];
        rms += val*val;
    }

    rms = Math.sqrt(rms/size);
    if (rms < 0.01) { // not enough signal
        return -1;
    }

    let lastCorrelation=1;
    for (let offset = MIN_SAMPLES; offset < max_samples; offset++) {
        let correlation = 0;

        for (let i = 0; i<max_samples; i++) {
            correlation += Math.abs((buf[i])-(buf[i+offset]));
        }
        correlation = 1 - (correlation/max_samples);
        correlations[offset] = correlation; // store it, for the tweaking we need to do below.
        if ((correlation>GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
            foundGoodCorrelation = true;
            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestOffset = offset;
            }
        } else if (foundGoodCorrelation) {
            // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
            // Now we need to tweak the offset - by interpolating between the values to the left and right of the
            // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
            // we need to do a curve fit on correlations[] around bestOffset in order to better determine precise
            // (anti-aliased) offset.

            // we know bestOffset >=1,
            // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and
            // we can't drop into this clause until the following pass (else if).
            let shift = (correlations[bestOffset+1] - correlations[bestOffset-1])/correlations[bestOffset];
            return sampleRate/(bestOffset+(8*shift));
        }
        lastCorrelation = correlation;
    }
    if (bestCorrelation > 0.01) {
        // console.log("f = " + sampleRate/bestOffset + "Hz (rms: " + rms + " confidence: " + bestCorrelation + ")")
        return sampleRate/bestOffset;
    }
    return null;
//	var best_frequency = sampleRate/bestOffset;
}

let noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteNumberFromPitch(frequency) {
    let noteNum = 12 * (Math.log(frequency / 440)/Math.log(2));
    return Math.round(noteNum) + 69;
}

function noteNameFromNumber(number) {
    return noteStrings[number % 12];
}

function frequencyFromNoteNumber( note ) {
    return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch(frequency, note) {
    return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note))/Math.log(2));
}

export function getNoteFromFFT(buffer, sampleRate) {
    let freq = autoCorrelate(buffer, sampleRate);
    let number = noteNumberFromPitch(freq);
    return {
        freq,
        number,
        name: noteNameFromNumber(number),
        offset: centsOffFromPitch(freq, number)
    }
}
