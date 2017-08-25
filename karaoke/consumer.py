import json

from channels.asgi import get_channel_layer
from channels import Channel, Group
from channels.security.websockets import allowed_hosts_only
from channels.sessions import channel_session, session_for_reply_channel, enforce_ordering


@allowed_hosts_only
@channel_session
def party_connected(message, party_id):
    message.channel_session["party_id"] = party_id
    message.reply_channel.send({"accept": True})
    message.reply_channel.send({"text": json.dumps({"action": "hello", "channel": message.reply_channel.name})})


@channel_session
def party_message(message):
    print("hi")
    content = json.loads(message.content['text'])
    action = content['action']
    group = Group(f"party-{message.channel_session['party_id']}")
    channels = get_channel_layer().group_channels(group.name)
    if len(channels) >= 6:
        message.reply_channel.send({"text": json.dumps({"action": "goodbye", "message": "room_full"})})
        message.reply_channel.send({"close": True})
        return
    if action == 'hello':
        message.channel_session['nickname'] = content['nick']
        message.reply_channel.send({"text": json.dumps({
            "action": "member_list",
            "members": {x: session_for_reply_channel(x)['nickname'] for x in channels}
        })})
        group.add(message.reply_channel)
        group.send({"text": json.dumps({
            "action": "new_member",
            "channel": message.reply_channel.name,
            "nick": content['nick']
        })})
    elif action == 'relay':
        Channel(content['target']).send({"text": json.dumps({
            "action": "relay",
            "origin": message.reply_channel.name,
            "message": content['message'],
        })})


@channel_session
def party_disconnected(message):
    if 'nickname' not in message.channel_session:
        return
    group = Group(f"party-{message.channel_session['party_id']}")
    group.discard(message.reply_channel)
    group.send({"text": json.dumps({
        "action": "member_left",
        "channel": message.reply_channel.name,
        "nick": message.channel_session['nickname']
    })})
