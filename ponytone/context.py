from django.conf import settings


def google_analytics(request):
    return {'ga_tracking_id': settings.GA_TRACKING_ID}
