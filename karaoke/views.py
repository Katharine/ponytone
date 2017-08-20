from django.shortcuts import render

# Create your views here.


def index(request, song):
    return render(request, "karaoke/index.html", {'song': song})
