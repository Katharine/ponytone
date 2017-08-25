import base64
import hmac
import time

from django.shortcuts import render, HttpResponse

# Create your views here.


def index(request):
    return render(request, "karaoke/index.html")


def song(request, song_id):
    return render(request, "karaoke/song.html", {'song': song_id})


def party(request, party_id):
    now = round(time.time() + 86400)
    username = ':'.join([str(now), str(party_id)])
    h = hmac.new(b'hello', msg=username.encode('utf-8'), digestmod='sha1').digest()
    h_encoded = base64.b64encode(h)
    return render(request, "karaoke/party.html", {'party_id': party_id, 'turn_user': username, 'turn_pass': h_encoded})


def ntp(request):
    now = round(time.time() * 1000)
    browser_time = int(request.GET['t'])
    return HttpResponse(f"{now - browser_time}:{browser_time}")
