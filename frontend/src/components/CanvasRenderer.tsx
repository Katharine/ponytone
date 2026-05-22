import React, { useEffect, useRef } from 'react';
import { Song, SongLine, type Note } from '../utils/ultrastar';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlayerState {
  id: number;
  nick: string;
  colour: string;
  part: number;
  score: number;
  notes: { time: number; note: number }[]; // Sung notes
  channel?: string;
}

interface CanvasRendererProps {
  song: Song;
  players: PlayerState[];
  currentTime: number; // in milliseconds
  duration: number; // in milliseconds
  width: number;
  height: number;
  videoUrl?: string | null;
  posterUrl?: string | null;
  videoStartTime?: number; // in seconds
  isPlaying: boolean;
}

const FONT = 'Ubuntu, sans-serif';
const LYRIC_BACKGROUND_COLOUR = 'rgba(20, 20, 20, 0.75)';
const GOLDEN_NOTE_INNER_COLOUR = '#ffe47e';
const GOLDEN_NOTE_OUTLINE_COLOUR = '#c39d0f';
const GOLDEN_NOTE_SING_COLOUR = '#ffea9f';
const GOLDEN_NOTE_SING_OUTLINE_COLOUR = '#836500';

const EXPECTED_NOTE_INNER_RATIO = 0.7;
const BAD_NOTE_RATIO = 0.4;
const AVAILABLE_LINES = 24;
const BASE_OFFSET = 4;
const SEMITONES_PER_OCTAVE = 12;

// Simple color helper to lighten/darken
function adjustColor(hex: string, amount: number): string {
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const CanvasRenderer: React.FC<CanvasRendererProps> = ({
  song,
  players,
  currentTime,
  duration,
  width,
  height,
  videoUrl,
  posterUrl,
  videoStartTime = 0,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lineMetricsRef = useRef<{ [key: string]: { lowestNote: number; lineStartBeat: number; lineEndBeat: number } }>({});

  // Sync video time with audio currentTime
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isPlaying) return;

    const targetTime = currentTime / 1000 + videoStartTime;
    if (Math.abs(video.currentTime - targetTime) > 0.3) {
      video.currentTime = targetTime;
    }
  }, [currentTime, isPlaying, videoStartTime]);

  // Handle Play/Pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch((e) => console.warn("Video play interrupted", e));
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Main draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Helpers to scale layout relative to 1280x720 coordinates
    const scaleW = 1280;
    const scaleH = 720;
    const d = (x: number, y: number, w: number, h: number): Rect => ({
      x: (x / scaleW) * width,
      y: (y / scaleH) * height,
      w: (w / scaleW) * width,
      h: (h / scaleH) * height,
    });

    const LYRICS = [d(0, 610, 1280, 90), d(0, 0, 1280, 90)];
    const LAYOUTS: { [key: number]: { notes: Rect; score: Rect }[] } = {
      1: [{ notes: d(20, 340, 1240, 250), score: d(0, 280, 1260, 60) }],
      2: [
        { notes: d(20, 390, 1240, 220), score: d(0, 350, 1260, 40) },
        { notes: d(20, 130, 1240, 220), score: d(0, 90, 1260, 40) },
      ],
      3: [
        { notes: d(20, 476, 1240, 133), score: d(0, 436, 1260, 40) },
        { notes: d(20, 303, 1240, 133), score: d(0, 263, 1260, 40) },
        { notes: d(20, 130, 1240, 133), score: d(0, 90, 1260, 40) },
      ],
      4: [
        { notes: d(20, 130, 610, 220), score: d(0, 90, 610, 40) },
        { notes: d(650, 130, 610, 220), score: d(650, 90, 610, 40) },
        { notes: d(20, 390, 610, 220), score: d(0, 350, 610, 40) },
        { notes: d(650, 390, 610, 220), score: d(650, 350, 610, 40) },
      ],
      5: [
        { notes: d(20, 476, 610, 133), score: d(0, 436, 610, 40) },
        { notes: d(20, 303, 610, 133), score: d(0, 263, 610, 40) },
        { notes: d(650, 303, 610, 133), score: d(650, 263, 610, 40) },
        { notes: d(20, 130, 610, 133), score: d(0, 90, 610, 40) },
        { notes: d(650, 130, 610, 133), score: d(650, 90, 610, 40) },
      ],
      6: [
        { notes: d(20, 476, 610, 133), score: d(0, 436, 610, 40) },
        { notes: d(650, 476, 610, 133), score: d(650, 436, 610, 40) },
        { notes: d(20, 303, 610, 133), score: d(0, 263, 610, 40) },
        { notes: d(650, 303, 610, 133), score: d(650, 263, 610, 40) },
        { notes: d(20, 130, 610, 133), score: d(0, 90, 610, 40) },
        { notes: d(650, 130, 610, 133), score: d(650, 90, 610, 40) },
      ],
    };

    const getLineMetrics = (line: SongLine) => {
      const key = `${line.notes[0].beat}-${line.line.start}`;
      if (!lineMetricsRef.current[key]) {
        let lowestNote = line.notes.reduce((min, note) => note.type !== 'F' && note.pitch < min ? note.pitch : min, Infinity);
        if (lowestNote === Infinity) {
          lowestNote = 0;
        }
        const lineStartBeat = line.notes[0].beat;
        const lineEndBeat = line.notes[line.notes.length - 1].beat + line.notes[line.notes.length - 1].length;
        lineMetricsRef.current[key] = { lowestNote, lineStartBeat, lineEndBeat };
      }
      return lineMetricsRef.current[key];
    };

    const matches = (actual: number, expected: number) => {
      const diff = Math.abs((actual % SEMITONES_PER_OCTAVE) - (expected % SEMITONES_PER_OCTAVE));
      return diff <= 1 || diff >= 11;
    };

    const getSungLine = (line: SongLine, expected: Note, actual: { time: number; note: number }) => {
      let { lowestNote } = getLineMetrics(line);
      lowestNote = ((lowestNote % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
      const actualNote = ((actual.note % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
      
      const expectedLine = (expected.pitch - lowestNote + BASE_OFFSET) % AVAILABLE_LINES;
      const renderLine = (((actualNote - lowestNote + BASE_OFFSET) % AVAILABLE_LINES) + AVAILABLE_LINES) % AVAILABLE_LINES;
      const altLine = (renderLine + SEMITONES_PER_OCTAVE) % AVAILABLE_LINES;

      const finalLine = (altLine === null || Math.abs(renderLine - expectedLine) < Math.abs(altLine - expectedLine))
        ? renderLine
        : altLine;

      const isSuccessful = actual.time >= expected.beat &&
        actual.time < expected.beat + expected.length &&
        (expected.type === 'F' || matches(expected.pitch, actual.note) || matches(expected.pitch, actual.note - 5));

      return isSuccessful ? expectedLine : finalLine;
    };

    // Draw frame
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Progress summary
    const progressRect = d(0, 700, 1280, 20);
    ctx.fillStyle = LYRIC_BACKGROUND_COLOUR;
    ctx.fillRect(progressRect.x, progressRect.y, progressRect.w, progressRect.h);

    const startBeat = song.msToBeats((song.start || 0) * 1000);
    const endBeatTotal = song.msToBeats(duration + (song.start || 0) * 1000);
    const pixelsPerBeat = progressRect.w / (endBeatTotal - startBeat);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const progressColours = ['rgba(66, 135, 244, 0.4)', 'rgba(215, 0, 0, 0.4)'];
    for (let partIdx = 0; partIdx < song.parts.length; partIdx++) {
      if (partIdx >= progressColours.length) break;
      ctx.fillStyle = progressColours[partIdx];
      for (const line of song.parts[partIdx]) {
        for (const note of line.notes) {
          ctx.fillRect(progressRect.x + (note.beat - startBeat) * pixelsPerBeat, progressRect.y, note.length * pixelsPerBeat, progressRect.h);
        }
      }
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    const pct = currentTime / duration;
    ctx.fillRect(progressRect.x, progressRect.y, progressRect.w * pct, progressRect.h);

    // 2. Draw Lyrics
    const beat = song.msToBeats(currentTime);
    for (let i = 0; i < song.parts.length; i++) {
      if (i >= LYRICS.length) break;
      const rect = LYRICS[i];
      ctx.save();
      ctx.fillStyle = LYRIC_BACKGROUND_COLOUR;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      const line = song.getLine(currentTime, i);
      if (line) {
        // Draw active line lyrics
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 1.5;
        ctx.font = `${rect.h * 0.45}px ${FONT}`;

        const lineText = line.notes.map((x) => x.text).join('');
        const totalWidth = ctx.measureText(lineText).width;
        const availableWidth = rect.w * 0.9;
        const minX = (rect.w - availableWidth) / 2;
        let lyricX = rect.x + (availableWidth / 2 - totalWidth / 2) + minX;
        let squashTextRatio: number | null = null;
        if (lyricX < minX) {
          lyricX = minX;
          squashTextRatio = availableWidth / totalWidth;
        }

        const startX = lyricX;
        const lyricY = rect.y + rect.h * 0.1;

        for (const note of line.notes) {
          const active = (beat >= note.beat && beat < note.beat + note.length);
          ctx.save();
          if (active) {
            ctx.fillStyle = i === 0 ? '#4287f4' : '#d70000';
            ctx.strokeStyle = 'white';
          }
          if (note.type === 'F') {
            ctx.font = `italic ${ctx.font}`;
          }
          const expectedWidth = ctx.measureText(note.text).width;
          const maxWidth = squashTextRatio !== null ? expectedWidth * squashTextRatio : undefined;

          ctx.fillText(note.text, lyricX, lyricY, maxWidth);
          if (active) {
            ctx.strokeText(note.text, lyricX, lyricY, maxWidth);
          }
          lyricX += maxWidth || expectedWidth;
          ctx.restore();
        }

        // Draw next line preview
        const nextLine = song.getLineAtIndex(line.index + 1, i);
        if (nextLine) {
          ctx.save();
          ctx.font = `${rect.h * 0.3}px ${FONT}`;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          const nextText = nextLine.notes.map((x) => x.text).join('');
          const nextWidth = ctx.measureText(nextText).width;
          const nextX = rect.x + (rect.w - nextWidth) / 2;
          ctx.fillText(nextText, nextX, rect.y + rect.h * 0.6);
          ctx.restore();
        }

        // Draw start indicator line (visual timer for next lyrics)
        if (line.notes.length > 0) {
          const firstNoteBeat = line.notes[0].beat;
          const lineStart = line.index === 0 ? song.msToBeats((song.start || 0) * 1000) : line.start;
          if (beat < firstNoteBeat && firstNoteBeat - lineStart > 10) {
            ctx.fillStyle = i === 0 ? '#4287f4' : '#d70000';
            const progress = (beat - lineStart) / (firstNoteBeat - lineStart);
            ctx.fillRect(rect.x + 5, rect.y + rect.h * 0.5, Math.max(0, Math.min(1, progress)) * (startX - 10), rect.h * 0.1);
          }
        }
      }
      ctx.restore();
    }

    // 3. Draw player note channels and scoreboards
    const activeLayout = LAYOUTS[players.length] || LAYOUTS[1];
    players.forEach((player, idx) => {
      if (idx >= activeLayout.length) return;
      const layout = activeLayout[idx];

      // Draw Grid lines
      ctx.save();
      ctx.clearRect(layout.notes.x, layout.notes.y, layout.notes.w, layout.notes.h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineCap = 'butt';
      for (let i = 0; i < 12; ++i) {
        ctx.beginPath();
        const y = layout.notes.y + (layout.notes.h - ((i + 0.5) * (layout.notes.h / 13.5))) - layout.notes.h / 27;
        ctx.moveTo(layout.notes.x, y);
        ctx.lineTo(layout.notes.x + layout.notes.w, y);
        ctx.stroke();
      }
      ctx.restore();

      const line = song.getLine(currentTime, player.part);
      if (!line) return;

      const lineMetric = getLineMetrics(line);
      const startBeat = line.notes[0].beat;
      const endBeat = line.notes[line.notes.length - 1].beat + line.notes[line.notes.length - 1].length;

      // Draw Expected Notes
      line.notes.forEach((note) => {
        if (note.type === 'F') {
          // Draw Freestyle background
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          const beatW = (layout.notes.w * 0.95) / (lineMetric.lineEndBeat - lineMetric.lineStartBeat);
          const xOffset = layout.notes.h / 7;
          const x1 = layout.notes.x + xOffset + beatW * (note.beat - lineMetric.lineStartBeat);
          const x2 = layout.notes.x + xOffset + beatW * (note.beat + note.length - lineMetric.lineStartBeat);
          ctx.fillRect(x1, layout.notes.y, x2 - x1, layout.notes.h);
          ctx.restore();
        } else {
          // Normal/Golden note
          const expectedLine = (note.pitch - lineMetric.lowestNote + BASE_OFFSET) % AVAILABLE_LINES;
          const isGold = note.type === '*';
          const innerColor = isGold ? GOLDEN_NOTE_INNER_COLOUR : adjustColor(player.colour, 60);
          const outerColor = isGold ? GOLDEN_NOTE_OUTLINE_COLOUR : adjustColor(player.colour, -30);

          let thickness = layout.notes.h / 8.8;
          ctx.save();
          ctx.lineCap = 'butt';
          ctx.fillStyle = innerColor;
          ctx.strokeStyle = outerColor;
          ctx.lineWidth = thickness * 0.1;
          const beatW = (layout.notes.w * 0.95) / (lineMetric.lineEndBeat - lineMetric.lineStartBeat);
          const xOffset = layout.notes.h / 7;
          const y = layout.notes.y + (layout.notes.h - ((expectedLine + 1) * (layout.notes.h / 27))) - layout.notes.h / 27;

          const x1 = layout.notes.x + xOffset + beatW * (note.beat - lineMetric.lineStartBeat);
          const x2 = layout.notes.x + xOffset + beatW * (note.beat + note.length - lineMetric.lineStartBeat);

          ctx.fillRect(x1, y - thickness / 2, x2 - x1, thickness);
          ctx.strokeRect(x1, y - thickness / 2, x2 - x1, thickness);
          ctx.restore();
        }
      });

      // Draw Sung Notes (only from current line segment)
      const sungInSegment = player.notes.filter((x) => startBeat <= x.time && x.time < endBeat);
      
      let lastRenderLine: number | null = null;
      let lastStart: number | null = null;
      let lastEnd: number | null = null;
      let lastWasMatching: boolean | null = null;
      let lastNote: Note | null = null;

      const drawSungLine = (rLine: number, startB: number, endB: number, isMatching: boolean, currentN: Note | null) => {
        if (rLine === null) return;
        const isGold = isMatching && currentN?.type === '*';
        const innerColor = isGold ? GOLDEN_NOTE_SING_COLOUR : adjustColor(player.colour, 90);
        const outerColor = isGold ? GOLDEN_NOTE_SING_OUTLINE_COLOUR : adjustColor(player.colour, -10);
        const scale = isMatching ? EXPECTED_NOTE_INNER_RATIO : BAD_NOTE_RATIO;

        let thickness = (layout.notes.h / 8.8) * scale;
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.fillStyle = innerColor;
        ctx.strokeStyle = outerColor;
        ctx.lineWidth = thickness * 0.1;
        const beatW = (layout.notes.w * 0.95) / (lineMetric.lineEndBeat - lineMetric.lineStartBeat);
        const xOffset = layout.notes.h / 7;
        const y = layout.notes.y + (layout.notes.h - ((rLine + 1) * (layout.notes.h / 27))) - layout.notes.h / 27;

        const x1 = layout.notes.x + xOffset + beatW * (startB - lineMetric.lineStartBeat);
        const x2 = layout.notes.x + xOffset + beatW * (endB + 1 - lineMetric.lineStartBeat);

        ctx.fillRect(x1, y - thickness / 2, x2 - x1, thickness);
        ctx.strokeRect(x1, y - thickness / 2, x2 - x1, thickness);
        ctx.restore();
      };

      sungInSegment.forEach((note) => {
        const expected = line.getNoteNearBeat(note.time);
        if (!expected) return;

        const rLine = getSungLine(line, expected, note);
        const isMatching = expected.type === 'F' || matches(expected.pitch, note.note) || matches(expected.pitch, note.note - 5);

        if (rLine === lastRenderLine && lastWasMatching === isMatching && note.time === lastEnd! + 1) {
          lastEnd = note.time;
        } else {
          if (lastRenderLine !== null) {
            drawSungLine(lastRenderLine, lastStart!, lastEnd!, lastWasMatching!, lastNote);
          }
          lastStart = note.time;
          lastEnd = note.time;
          lastRenderLine = rLine;
          lastWasMatching = isMatching;
          lastNote = expected;
        }
      });
      if (lastRenderLine !== null) {
        drawSungLine(lastRenderLine, lastStart!, lastEnd!, lastWasMatching!, lastNote);
      }

      // Draw Scoreboards
      ctx.save();
      ctx.font = `bold ${layout.score.h * 0.8}px ${FONT}`;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.fillStyle = player.colour;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.lineWidth = 3;
      
      const scoreY = layout.score.y;
      const text = `${player.nick}: ${player.score}`;
      ctx.strokeText(text, layout.score.x + layout.score.w, scoreY);
      ctx.fillText(text, layout.score.x + layout.score.w, scoreY);
      ctx.restore();
    });

  }, [song, players, currentTime, duration, width, height]);

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', borderRadius: '12px', background: '#000', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
          muted
          playsInline
          poster={posterUrl || undefined}
        />
      )}
      {!videoUrl && posterUrl && (
        <img
          src={posterUrl}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }}
          alt="Song background"
        />
      )}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width, height, pointerEvents: 'none', zIndex: 10 }}
      />
    </div>
  );
};
