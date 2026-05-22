package scoring

import (
	"bufio"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
)

type NoteType string

const (
	Normal    NoteType = ":"
	Golden    NoteType = "*"
	Freestyle NoteType = "F"
)

type Note struct {
	Type   NoteType
	Beat   int
	Length int
	Pitch  int
	Text   string
}

type NoteLine struct {
	Notes []Note
	Start int
	End   int
}

type Song struct {
	Title string
	Bpm   float64
	Gap   int
	Parts [][]NoteLine
}

type SungNote struct {
	Time int `json:"time"`
	Note int `json:"note"`
}

// FetchNotesFromS3 downloads the UltraStar notes.txt for a song from the Ponytone S3 bucket
func FetchNotesFromS3(songID uint) (string, error) {
	url := fmt.Sprintf("https://music.ponytone.online/%d/notes.txt", songID)
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to fetch notes from S3: HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return string(body), nil
}

// ParseSongNotes parses UltraStar note file contents
func ParseSongNotes(text string) (*Song, error) {
	song := &Song{
		Parts: [][]NoteLine{},
	}

	var currentPart []NoteLine
	currentLine := NoteLine{Notes: []Note{}, Start: 0}

	scanner := bufio.NewScanner(strings.NewReader(strings.ReplaceAll(text, "\r", "")))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if len(line) == 0 {
			continue
		}

		char := string(line[0])
		switch char {
		case "#":
			// Meta command
			parts := strings.SplitN(line[1:], ":", 2)
			if len(parts) == 2 {
				key := strings.ToUpper(strings.TrimSpace(parts[0]))
				val := strings.TrimSpace(parts[1])
				switch key {
				case "TITLE":
					song.Title = val
				case "BPM":
					val = strings.ReplaceAll(val, ",", ".")
					if bpm, err := strconv.ParseFloat(val, 64); err == nil {
						song.Bpm = bpm
					}
				case "GAP":
					if gap, err := strconv.Atoi(val); err == nil {
						song.Gap = gap
					}
				}
			}
		case "P":
			if len(currentPart) > 0 || len(currentLine.Notes) > 0 {
				if len(currentLine.Notes) > 0 {
					currentPart = append(currentPart, currentLine)
				}
				if len(currentPart) > 0 {
					song.Parts = append(song.Parts, currentPart)
				}
				currentLine = NoteLine{Notes: []Note{}, Start: 0}
				currentPart = []NoteLine{}
			}
		case ":", "*", "F":
			note, err := parseNote(line)
			if err == nil {
				currentLine.Notes = append(currentLine.Notes, note)
			}
		case "-":
			currentPart = append(currentPart, currentLine)
			currentLine = parseNewLine(line)
		case "E":
			if len(currentLine.Notes) > 0 {
				currentPart = append(currentPart, currentLine)
			}
			if len(currentPart) > 0 {
				song.Parts = append(song.Parts, currentPart)
			}
			currentLine = NoteLine{Notes: []Note{}, Start: 0}
			currentPart = []NoteLine{}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return song, nil
}

func parseNote(line string) (Note, error) {
	// Format: [Type] [Beat] [Length] [Pitch] [Text]
	// Example: : 10 4 60 Hello
	parts := strings.SplitN(line, " ", 5)
	if len(parts) < 4 {
		return Note{}, fmt.Errorf("invalid note line: %s", line)
	}

	beat, err1 := strconv.Atoi(parts[1])
	length, err2 := strconv.Atoi(parts[2])
	pitch, err3 := strconv.Atoi(parts[3])
	if err1 != nil || err2 != nil || err3 != nil {
		return Note{}, fmt.Errorf("invalid note integers: %s", line)
	}

	text := ""
	if len(parts) == 5 {
		text = parts[4]
	}

	return Note{
		Type:   NoteType(parts[0]),
		Beat:   beat,
		Length: length,
		Pitch:  pitch,
		Text:   text,
	}, nil
}

func parseNewLine(line string) NoteLine {
	// Format: - [Start] [End]
	parts := strings.Split(line, " ")
	start := 0
	end := 0
	if len(parts) > 1 {
		start, _ = strconv.Atoi(parts[1])
	}
	if len(parts) > 2 {
		end, _ = strconv.Atoi(parts[2])
	}
	ret := NoteLine{Start: start, Notes: []Note{}}
	if end > 0 {
		ret.End = end
	}
	return ret
}

// CalculateScore computes the score based on the target notes and the sung pitch replay log
func CalculateScore(song *Song, partIndex int, replayLog []SungNote) int {
	if partIndex < 0 || partIndex >= len(song.Parts) {
		return 0
	}

	// Flatten expected notes for the chosen part
	part := song.Parts[partIndex]
	var expected []Note
	for _, line := range part {
		for _, note := range line.Notes {
			if note.Type != Freestyle {
				expected = append(expected, note)
			}
		}
	}

	if len(expected) == 0 {
		return 0
	}

	// Calculate total beat weight
	totalBeats := 0
	for _, note := range expected {
		weight := 1
		if note.Type == Golden {
			weight = 2
		}
		totalBeats += weight * note.Length
	}

	if totalBeats == 0 {
		return 0
	}

	scorePerBeat := 10000.0 / float64(totalBeats)
	score := 0.0
	i := 0

	for _, note := range expected {
		// Advance index i in replay log until actual time >= note.Beat
		for i < len(replayLog) && replayLog[i].Time < note.Beat {
			i++
		}

		// Loop while actual time falls within note duration
		for i < len(replayLog) && replayLog[i].Time < note.Beat+note.Length {
			actualNote := replayLog[i].Note

			// Score correct notes, and notes five semitones too low (pitch correction)
			if matches(actualNote, note.Pitch) || matches(actualNote, note.Pitch-5) {
				weight := 1.0
				if note.Type == Golden {
					weight = 2.0
				}
				score += scorePerBeat * weight
			}
			i++
		}
	}

	return int(math.Round(score))
}

func matches(actual, target int) bool {
	actMod := ((actual % 12) + 12) % 12
	tgtMod := ((target % 12) + 12) % 12
	diff := actMod - tgtMod
	if diff < 0 {
		diff = -diff
	}
	return diff <= 1 || diff >= 11
}
