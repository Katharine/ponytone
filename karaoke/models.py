from django.db import models


class Party(models.Model):
    id = models.CharField(max_length=10, unique=True, primary_key=True)
    created = models.DateTimeField(auto_now_add=True)
    songs = models.ManyToManyField('Song', through='Playlist')


class PartyMember(models.Model):
    id = models.AutoField(primary_key=True)
    party = models.ForeignKey(Party, related_name="members")
    nick = models.CharField(max_length=30, null=True)
    colour = models.CharField(max_length=7, null=True)
    participating = models.BooleanField(default=True)
    channel = models.CharField(max_length=255, unique=True)


class Song(models.Model):
    id = models.AutoField(primary_key=True)
    title = models.CharField(max_length=255, db_index=True)
    artist = models.CharField(max_length=255, db_index=True)
    song_year = models.IntegerField(db_index=True, null=True)
    transcriber = models.CharField(max_length=255, null=True)
    is_mlk = models.BooleanField(default=False)
    genre = models.CharField(max_length=255)
    updated = models.DateField(db_index=True, null=True)
    language = models.CharField(max_length=255, db_index=True)
    length = models.IntegerField(db_index=True)
    preview_start = models.IntegerField(null=True)


class Playlist(models.Model):
    party = models.ForeignKey(Party, on_delete=models.CASCADE)
    song = models.ForeignKey(Song, on_delete=models.CASCADE)
    order = models.PositiveIntegerField()
