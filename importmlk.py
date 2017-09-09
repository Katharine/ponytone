#!/usr/bin/env python
from collections import namedtuple
import os
import sys
import tarfile
import tempfile
import mimetypes

import boto3
import chardet
import dateutil.parser
import mutagen.mp3
import psycopg2
import psycopg2.extras
import requests


# Hackery to deal with strange MLK dates.
class MLKDateParserInfo(dateutil.parser.parserinfo):
    MONTHS = [
        ('Jan', 'January'),
        ('Feb', 'February', 'fev'),
        ('Mar', 'March'),
        ('Apr', 'April', 'avr'),
        ('May', 'May', 'mai'),
        ('Jun', 'June', 'juin'),
        ('Jul', 'July', 'juil'),
        ('Aug', 'August', 'ago'),
        ('Sep', 'Sept', 'September', 'seo'),
        ('Oct', 'October'),
        ('Nov', 'November'),
        ('Dec', 'December', 'det')
    ]


def parse(content: bytes):
    encoding = chardet.detect(content)
    decoded = content.decode(encoding['encoding'])
    fields = {}
    for line in decoded.split('\n'):
        line = line.strip()
        if len(line) <= 1:
            continue
        if line[0] == '#':
            try:
                k, v = line.split(':', 1)
            except ValueError:
                print(f"Bad line {line} in {filename}")
            else:
                fields[k[1:]] = v
    return fields or None

SongInfo = namedtuple("SongInfo", "title artist genre song_year length language transcriber is_mlk updated notes mp3 "
                                  "background video preview_start parts cover")


def song_info(tar: tarfile.TarFile, path: str):
    content = tar.extractfile(path)
    parsed = parse(content.read())
    if parsed is None:
        return None
    artist = parsed.get('ARTIST')
    transcriber = parsed.get('CREATOR')
    genre = parsed.get('GENRE', 'Pony')
    language = parsed.get('LANGUAGE', 'English')
    title = parsed.get('TITLE')
    cover = parsed['COVER']
    song_year = int(parsed.get('YEAR', '0')) or None
    try:
        updated = dateutil.parser.parse(parsed['UPDATED'], MLKDateParserInfo()) if 'UPDATED' in parsed else None
    except ValueError:
        print(f"Couldn't parse date: {parsed['UPDATED']}")
        updated = None
    mp3_path = os.path.join(os.path.dirname(path), parsed['MP3'])
    try:
        tar.getmember(mp3_path)
    except KeyError:
        return None
    if 'END' in parsed:
        duration = int(parsed['END']) / 1000
    else:
        duration = mutagen.mp3.MP3(tar.extractfile(mp3_path)).info.length
    if 'START' in parsed:
        duration -= float(parsed['START'].replace(',', '.'))
    is_mlk = 'mylittlekaraoke' in parsed.get('COMMENT', '')
    mp3 = parsed['MP3']
    background = parsed.get('BACKGROUND')
    video = parsed.get('VIDEO')
    if 'P1' and 'P2' in parsed:
        parts = [parsed['P1'], parsed['P2']]
    else:
        parts = None

    preview_start = float(parsed['PREVIEWSTART'].replace(',', '.')) if 'PREVIEWSTART' in parsed else None
    return SongInfo(title, artist, genre, song_year, duration, language, transcriber, is_mlk, updated, path, mp3,
                    background, video, preview_start, parts, cover)


def store_song(connection, tar: tarfile.TarFile, song: SongInfo):
    client = boto3.client('s3')
    opts = {'ACL': 'public-read', 'Bucket': 'music.ponytone.online'}
    with connection:
        with connection.cursor() as cur:
            stuff = song._asdict()
            if song.parts:
                stuff['parts'] = psycopg2.extras.Json(song.parts)
            q = cur.execute("""
                INSERT INTO karaoke_song (title, artist, transcriber, genre, updated, "language", "length",
                                          preview_start, song_year, is_mlk, cover_image, parts)
                VALUES (%(title)s, %(artist)s, %(transcriber)s, %(genre)s, %(updated)s, %(language)s, %(length)s,
                        %(preview_start)s, %(song_year)s, %(is_mlk)s, %(cover)s, %(parts)s)
                RETURNING id""", stuff)
            id, = cur.fetchone()
            print(f"Inserted into DB: #{id}")

            dirname = os.path.dirname(song.notes)
            f = tar.extractfile(song.notes)
            client.put_object(Body=f, Key=f"{id}/notes.txt", ContentType="text/plain", **opts)
            f = tar.extractfile(os.path.join(dirname, song.mp3))
            print("Uploaded MP3")
            client.put_object(Body=f, Key=f"{id}/{song.mp3}", ContentType="audio/mpeg", **opts)
            f = tar.extractfile(os.path.join(dirname, song.cover))
            print("Uploaded cover")
            client.put_object(Body=f, Key=f"{id}/{song.cover}",
                              ContentType=mimetypes.guess_type(song.cover)[0], **opts)
            if song.background:
                f = tar.extractfile(os.path.join(dirname, song.background))
                client.put_object(Body=f, Key=f"{id}/{song.background}",
                                  ContentType=mimetypes.guess_type(song.background)[0], **opts)
                print("Uploaded background")
            if song.video:
                f = tar.extractfile(os.path.join(dirname, song.video))
                client.put_object(Body=f, Key=f"{id}/{song.video}",
                                  ContentType=mimetypes.guess_type(song.video)[0], **opts)
                print("Uploaded video")
    print("Committed")


if __name__ == "__main__":
    url = sys.argv[1]
    connection = psycopg2.connect(sys.argv[2])

    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with tempfile.TemporaryFile() as f:
            for chunk in r.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
            f.seek(0)
            tar = tarfile.open(fileobj=f)
            filenames = tar.getnames()
            for filename in filenames:
                if not filename.endswith(".txt"):
                    continue
                info = song_info(tar, filename)
                store_song(connection, tar, info)
