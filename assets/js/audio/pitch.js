"use strict";

const MIN_RMS = 0.01;
const GOOD_ENOUGH_CORRELATION = 0.8; // this is the "bar" for how close a correlation needs to be

function autoCorrelate(buffer, sampleRate) {
    // Keep track of best period/correlation
    let bestPeriod = 0;
    let bestCorrelation = 0;

    // Keep track of local minima (i.e. nearby low correlation)
    let worstPeriod = 0;
    let worstCorrelation = 1;

    // Remember previous correlation to determine if
    // we're ascending (i.e. getting near a frequency in the signal)
    // or descending (i.e. moving away from a frequency in the signal)
    let lastCorrelation = 1;

    // iterators
    let i = 0; // for the different periods we're checking
    let j = 0; // for the different "windows" we're checking
    let period = 0; // current period we're checking.

    // calculated stuff
    let rms = 0;
    let correlation = 0;
    let peak = 0;

    // early stop algorithm
    let foundPitch = false;

    // Constants
    const BUFFER_LENGTH = buffer.length;
    const MAX_SAMPLES = BUFFER_LENGTH / 2;

    const PERIOD_LENGTH = 1022;
    let correlations = new Array(MAX_SAMPLES);


    // Check if there is enough signal
    for (i=0; i< BUFFER_LENGTH;i++) {
        rms += buffer[i]*buffer[i];
        // determine peak volume
        if(buffer[i] > peak) peak = buffer[i];
    }

    rms = Math.sqrt(rms/ BUFFER_LENGTH);

    // Abort if not enough signal
    if (rms < MIN_RMS) {
        return false;
    }

    /**
     *  Test different periods (i.e. frequencies)
     *
     *  Buffer: |----------------------------------------| (1024)
     *  i:      |    					1      44.1 kHz
     *  		||                      2      22.05 kHz
     *  		|-|                     3      14.7 kHz
     *  		|--|                    4      11 kHz
     *          ...
     *          |-------------------|   512    86hz
     *
     *
     *  frequency = sampleRate / period
     *  period = sampleRate / frequency
     *
     *
     */
    for (i=0; i < PERIOD_LENGTH; i++) {
        period = i + 2;
        correlation = 0;

        /**
         *
         * Sum all differences
         *
         * Version 1: Use absolute difference
         * Version 2: Use squared difference.
         *
         * Version 2 exagerates differences, which is a good property.
         * So we'll use version 2.
         *
         *  Buffer: |-------------------|--------------------| (1024)
         *  j:
         *  		|---|                        0
         *  		 |---|                       1
         *  		  |---|                      2
         *  		    ...
         *  		                     |---|   512
         *
         *  sum-of-differences
         */
        for (j=0; j < MAX_SAMPLES; j++) {
            // Version 1: Absolute values
            correlation += Math.abs((buffer[j])-(buffer[j+period]));

            // Version 2: Squared values (exagarates difference, works better)
            //correlation += Math.pow((buffer[j]-buffer[j+period]),2);
        }

        // Version 1: Absolute values
        correlation = 1 - (correlation/MAX_SAMPLES);

        // Version 2: Squared values
        //correlation = 1 - Math.sqrt(correlation/MAX_SAMPLES);

        // Save Correlation
        correlations[period] = correlation;

        // We're descending (i.e. moving towards frequencies that are NOT in here)
        if(lastCorrelation > correlation){

            if(GOOD_ENOUGH_CORRELATION && bestCorrelation > GOOD_ENOUGH_CORRELATION) {
                foundPitch = true;
                break;
            }

            // Save the worst correlation of the latest descend (local minima)
            worstCorrelation = correlation;
            worstPeriod = period;

            // we're ascending, and found a new high!
        } else if(correlation > bestCorrelation){
            bestCorrelation = correlation;
            bestPeriod = period;
        }

        lastCorrelation = correlation;
    }

    if (bestCorrelation >= GOOD_ENOUGH_CORRELATION && foundPitch) {
        let shift = 0;
        if(i >= 3 && period >= bestPeriod + 1 && correlations[bestPeriod+1] && correlations[bestPeriod-1]){
            // Now we need to tweak the period - by interpolating between the values to the left and right of the
            // best period, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
            // we need to do a curve fit on correlations[] around bestPeriod in order to better determine precise
            // (anti-aliased) period.

            // we know bestPeriod >=1,
            // since foundPitch cannot go to true until the second pass (period=1), and
            // we can't drop into this clause until the following pass (else if).
            shift = (correlations[bestPeriod+1] - correlations[bestPeriod-1]) / bestCorrelation;
            shift = shift * 8;
        }
        return sampleRate/(bestPeriod + shift);
    } else {
        return null;
    }
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

export function getNoteFromBuffer(buffer, sampleRate) {
    let freq = autoCorrelate(buffer, sampleRate);
    if (!freq) {
        return {freq: null, number: null, name: null, offset: null};
    }
    let number = noteNumberFromPitch(freq);
    return {
        freq,
        number,
        name: noteNameFromNumber(number),
        offset: centsOffFromPitch(freq, number)
    }
}