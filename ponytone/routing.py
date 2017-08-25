from channels.routing import include

from karaoke.routing import karaoke_routing

channel_routing = [
    include(karaoke_routing, path="^/karaoke"),
]
