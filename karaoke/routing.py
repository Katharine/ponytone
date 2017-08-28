from channels.routing import route

from .consumer import party_connected, party_disconnected, party_message

karaoke_routing = [
    route("websocket.connect", party_connected, path=r"^/party/(?P<party_id>[a-zA-Z0-9_-]+)"),
    route("websocket.receive", party_message),
    route("websocket.disconnect", party_disconnected)
]
