import base64
import hmac
import json
import random
import string
import time
import datetime

from django.conf import settings
from django.shortcuts import render, HttpResponse, get_object_or_404
from django.views.decorators.http import condition, require_POST
from django.views.decorators.csrf import ensure_csrf_cookie

from .models import Party, PartyMember, Playlist, Song

# Create your views here.


@ensure_csrf_cookie
def index(request):
    songs = Song.objects.all()
    return render(request, "karaoke/index.html", {'songs': songs})


@ensure_csrf_cookie
def party(request, party_id):
    party = get_object_or_404(Party, id=party_id)
    now = round(time.time() + 86400)
    username = ':'.join([str(now), str(party_id)])
    h = hmac.new(b'hello', msg=username.encode('utf-8'), digestmod='sha1').digest()
    h_encoded = base64.b64encode(h)
    request.session['party_id'] = party.id
    return render(request, "karaoke/party.html",
                  {'party_id': party.id, 'turn_user': username, 'turn_pass': h_encoded})


@require_POST
def create_party(request):
    while True:
        random_url = ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(8))
        if not Party.objects.filter(id=random_url).exists():
            break
    party = Party(id=random_url)
    party.save()
    return HttpResponse(random_url, content_type="text/plain")


def ntp(request):
    now = round(time.time() * 1000)
    browser_time = int(request.GET['t'])
    return HttpResponse(f"{now - browser_time}:{browser_time}")


def track_listing_tag(request):
    return f"lastsong-{Song.objects.latest('id').id}"


def credits(request):
    return render(request, "karaoke/credits.html")


def faq(request):
    return render(request, "karaoke/faq.html")


@condition(etag_func=track_listing_tag)
def track_listing(request):
    results = []
    for song in Song.objects.all():
        result = {
            'id': song.id,
            'title': song.title,
            'artist': song.artist,
            'transcriber': song.transcriber,
            'length': song.length,
            'cover': song.cover_image,
        }
        if song.parts is not None:
            result['duet'] = song.parts
        results.append(result)
    return HttpResponse(json.dumps(results), content_type="application/json")
