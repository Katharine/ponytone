from django.shortcuts import render

# Create your views here.


def index(request):
    return render(request, "karaoke/index.html")


def song(request, song_id):
    return render(request, "karaoke/song.html", {'song': song_id})
