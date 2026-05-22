import { useEffect, useRef, useState } from 'react';

const MIN_RMS = 0.01;
const GOOD_ENOUGH_CORRELATION = 0.9;

export interface DetectedNote {
  freq: number | null;
  number: number | null;
  name: string | null;
  offset: number | null;
}

const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function autoCorrelate(buffer: Float32Array, sampleRate: number): number | null {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < MIN_RMS) {
    return null;
  }

  const maxSamples = Math.floor(buffer.length / 2);
  const periodLength = maxSamples - 2;
  const correlations = new Array(maxSamples);
  let bestPeriod = 0;
  let bestCorrelation = 0;
  let lastCorrelation = 1;

  for (let i = 0; i < periodLength; i++) {
    const period = i + 2;
    let correlation = 0;
    for (let j = 0; j < maxSamples; j++) {
      correlation += Math.abs(buffer[j] - buffer[j + period]);
    }
    correlation = 1 - (correlation / maxSamples);
    correlations[period] = correlation;

    if (lastCorrelation > correlation) {
      // descending
    } else if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestPeriod = period;
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation >= GOOD_ENOUGH_CORRELATION) {
    let shift = 0;
    if (bestPeriod + 1 < maxSamples && correlations[bestPeriod + 1] && correlations[bestPeriod - 1]) {
      shift = (correlations[bestPeriod + 1] - correlations[bestPeriod - 1]) / bestCorrelation;
      shift = shift * 8;
    }
    return sampleRate / (bestPeriod + shift);
  }
  return null;
}

export function noteNumberFromPitch(frequency: number): number {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return Math.round(noteNum) + 69;
}

export function noteNameFromNumber(num: number): string {
  return noteStrings[num % 12];
}

export function frequencyFromNoteNumber(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function centsOffFromPitch(frequency: number, note: number): number {
  return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}

export function getNoteFromBuffer(buffer: Float32Array, sampleRate: number): DetectedNote {
  const freq = autoCorrelate(buffer, sampleRate);
  if (!freq) {
    return { freq: null, number: null, name: null, offset: null };
  }
  const number = noteNumberFromPitch(freq);
  return {
    freq,
    number,
    name: noteNameFromNumber(number),
    offset: centsOffFromPitch(freq, number)
  };
}

export function useAudioEngine(onPitch: (note: DetectedNote) => void) {
  const [isActive, setIsActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const onPitchRef = useRef(onPitch);

  useEffect(() => {
    onPitchRef.current = onPitch;
  }, [onPitch]);

  const start = async () => {
    if (isActive) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
      streamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      
      const biquad = audioCtx.createBiquadFilter();
      biquad.type = "lowpass";
      biquad.frequency.value = 2500;
      biquad.Q.value = 0.5;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048; // gives buffer of length 2048, max samples = 1024
      
      source.connect(biquad);
      biquad.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      
      setIsActive(true);

      const updatePitch = () => {
        analyser.getFloatTimeDomainData(buffer);
        const note = getNoteFromBuffer(buffer, audioCtx.sampleRate);
        if (note.number !== null) {
          onPitchRef.current(note);
        }
        animationFrameRef.current = requestAnimationFrame(updatePitch);
      };

      animationFrameRef.current = requestAnimationFrame(updatePitch);
    } catch (err) {
      console.error("Audio capture failed", err);
      setIsActive(false);
    }
  };

  const stop = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsActive(false);
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return { isActive, start, stop };
}
