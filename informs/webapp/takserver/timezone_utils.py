"""
Centralized timezone utilities for consistent timezone handling across the application.

Uses Python 3.12+ best practices:
- datetime.now(timezone.utc) instead of deprecated datetime.utcnow()
- Django's timezone utilities for user-aware timezone conversion
- Single source of truth for all timezone operations (DRY principle)

This module should be used for ALL timezone operations in the Django app.
For takmesh_gateway (separate service), use datetime.now(UTC) directly.
"""
from datetime import datetime, timezone as dt_timezone
from typing import Optional

from django.utils import timezone as django_timezone


def now_utc() -> datetime:
    """
    Get current UTC time (timezone-aware).
    
    Replaces deprecated datetime.utcnow().
    
    Returns:
        datetime: Current UTC time, timezone-aware
    """
    return datetime.now(dt_timezone.utc)


def parse_iso_to_local(iso_string: str) -> Optional[datetime]:
    """
    Parse ISO timestamp string and convert to user's local timezone.
    
    Args:
        iso_string: ISO format timestamp (e.g., "2026-01-11T23:07:22")
    
    Returns:
        datetime: Local timezone-aware datetime, or None if parsing fails
    """
    if not iso_string:
        return None
    
    try:
        from dateutil import parser as date_parser
        dt_parsed = date_parser.parse(iso_string)
        
        # Make timezone-aware if naive (assume UTC from API)
        if django_timezone.is_naive(dt_parsed):
            dt_utc = django_timezone.make_aware(dt_parsed, django_timezone.utc)
        else:
            dt_utc = dt_parsed
        
        # Convert to user's local timezone (handled by Django's tz_detect middleware)
        return django_timezone.localtime(dt_utc)
    except (ValueError, TypeError, AttributeError):
        return None


def format_timestamp_info(dt: datetime) -> dict:
    """
    Format datetime into display components.
    
    Args:
        dt: Timezone-aware datetime
    
    Returns:
        dict with keys: iso, tz, offset, hms
    """
    if not dt:
        return {
            'iso': '-',
            'tz': '',
            'offset': '',
            'hms': '-'
        }
    
    # Ensure timezone-aware
    if django_timezone.is_naive(dt):
        dt = django_timezone.make_aware(dt, django_timezone.utc)
    
    # Convert to local timezone
    dt_local = django_timezone.localtime(dt)
    
    # Format timezone name
    tz_name = dt_local.strftime('%Z') or (dt_local.tzname() if dt_local.tzinfo else 'UTC')
    
    # Format offset as +/-HH:MM
    if dt_local.tzinfo:
        offset = dt_local.utcoffset()
        if offset:
            offset_seconds = offset.total_seconds()
            offset_hours = int(offset_seconds // 3600)
            offset_mins = int((offset_seconds % 3600) // 60)
            offset_str = f"{offset_hours:+03d}:{abs(offset_mins):02d}"
        else:
            offset_str = '+00:00'
    else:
        offset_str = '+00:00'
    
    return {
        'iso': dt_local.isoformat(),
        'tz': tz_name,
        'offset': offset_str,
        'hms': dt_local.strftime('%H:%M:%S')
    }


def cot_time(delta_seconds: int = 0) -> str:
    """
    Generate CoT-formatted timestamp (UTC).
    
    Args:
        delta_seconds: Seconds to add to current time (for stale time)
    
    Returns:
        ISO 8601 formatted timestamp string with Z suffix
    """
    from datetime import timedelta
    dt = now_utc() + timedelta(seconds=delta_seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
