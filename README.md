# ponytone
Ponytone is a web-based online multiplayer karaoke game.

## Getting Started

The easiest way to get an instance of Ponytone running is using docker-compose.
To get an instance running, run:

```
$ docker-compose up
```

This will still be pointing at music.ponytone.online to fetch music, which is
currently hardcoded. (want to fix this? make a PR!)

To rebuild the frontend, run `yarn build`, which will invoke webpack.

## Importing songs

The provided `importmlk.py` script takes a URL to an MLK-style
archive and will download the file, upload all the relevant parts to S3,
and insert some metadata into the database.

## ...

There's probably a lot more to say. Talk to me!
[KatharineBerry](http://t.me/KatharineBerry) on Telegram or Katharine#0001
on Discord (or try the [Ponytone Discord server](https://discord.gg/QGHdhSU).
