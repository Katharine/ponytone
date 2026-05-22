package scoring

import (
	"testing"
)

func TestParseSongNotes(t *testing.T) {
	sampleNotes := `#TITLE:Test Song
#BPM:120,5
#GAP:1000
: 0 4 60 A
: 4 4 64 B
: 8 4 67 C
* 12 4 72 D
- 16
: 16 4 76 E
E`

	song, err := ParseSongNotes(sampleNotes)
	if err != nil {
		t.Fatalf("ParseSongNotes failed: %v", err)
	}

	if song.Title != "Test Song" {
		t.Errorf("Expected title 'Test Song', got '%s'", song.Title)
	}
	if song.Bpm != 120.5 {
		t.Errorf("Expected BPM 120.5, got %f", song.Bpm)
	}
	if song.Gap != 1000 {
		t.Errorf("Expected GAP 1000, got %d", song.Gap)
	}

	if len(song.Parts) != 1 {
		t.Fatalf("Expected 1 part, got %d", len(song.Parts))
	}

	part := song.Parts[0]
	// Should have 2 lines separated by '-'
	if len(part) != 2 {
		t.Fatalf("Expected 2 lines in part, got %d", len(part))
	}

	if len(part[0].Notes) != 4 {
		t.Errorf("Expected 4 notes in line 1, got %d", len(part[0].Notes))
	}

	lastNote := part[1].Notes[0]
	if lastNote.Pitch != 76 || lastNote.Text != "E" {
		t.Errorf("Expected last note pitch 76 and text 'E', got %d and '%s'", lastNote.Pitch, lastNote.Text)
	}
}

func TestCalculateScore(t *testing.T) {
	sampleNotes := `#TITLE:Test Song
#BPM:120
#GAP:0
: 0 4 60 A
: 4 4 62 B
* 8 4 64 C
E`

	song, err := ParseSongNotes(sampleNotes)
	if err != nil {
		t.Fatalf("ParseSongNotes failed: %v", err)
	}

	// Normal beat weight: 1. Golden beat weight: 2.
	// Total beats: 4 (normal) * 1 + 4 (normal) * 1 + 4 (golden) * 2 = 4 + 4 + 8 = 16 beats.
	// Score per beat: 10000 / 16 = 625.

	// Perfect match
	replay := []SungNote{
		{Time: 0, Note: 60},
		{Time: 1, Note: 60},
		{Time: 2, Note: 60},
		{Time: 3, Note: 60},

		{Time: 4, Note: 62},
		{Time: 5, Note: 62},
		{Time: 6, Note: 62},
		{Time: 7, Note: 62},

		{Time: 8, Note: 64},
		{Time: 9, Note: 64},
		{Time: 10, Note: 64},
		{Time: 11, Note: 64},
	}

	score := CalculateScore(song, 0, replay)
	if score != 10000 {
		t.Errorf("Expected perfect score 10000, got %d", score)
	}

	// Partial match, with some wrong notes, and pitch-shifted -5 match
	// 4 beats perfect at 60 (score = 4 * 625 = 2500)
	// 4 beats matching 62-5 = 57 (score = 4 * 625 = 2500)
	// 4 beats of golden matching incorrectly (score = 0)
	// Total expected score: 5000
	replayPartial := []SungNote{
		{Time: 0, Note: 60},
		{Time: 1, Note: 60},
		{Time: 2, Note: 60},
		{Time: 3, Note: 60},

		{Time: 4, Note: 57}, // matching 62 - 5 semitones
		{Time: 5, Note: 57},
		{Time: 6, Note: 57},
		{Time: 7, Note: 57},

		{Time: 8, Note: 67}, // incorrect
		{Time: 9, Note: 67},
		{Time: 10, Note: 67},
		{Time: 11, Note: 67},
	}

	scorePartial := CalculateScore(song, 0, replayPartial)
	if scorePartial != 5000 {
		t.Errorf("Expected partial score 5000, got %d", scorePartial)
	}
}
