# import asyncio

# from aidrequests.models import AidRequest, AidLocation

# from icecream import ic


def aidrequest_location(locations=None):
    status = aidrequest_locationstatus(locations)
    if status == 'confirmed':
        location = next((location for location in locations if location.status == 'confirmed'), None)
        # location = locations.filter(status='confirmed').first()
    elif status == 'new':
        location = next((location for location in locations if location.status == 'new'), None)
    else:
        location = None
    return status, location


def aidrequest_locationstatus(locations=None):
    for status in ['confirmed', 'new']:
        if any(location.status == status for location in locations):
            return status
    return None
