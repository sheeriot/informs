"""
JSON payload formatter for high-density display with preferred break points.

Formats JSON with:
- Logical field ordering
- High information density (more fields per line)
- Preferred break points using zero-width spaces (invisible markers)
- Compact format suitable for storage in Redis
"""
import json
from typing import Any, Dict

# Zero-width space (U+200B) - invisible but allows CSS word-wrap to break
ZWSP = '\u200B'


def format_payload_json(payload: Dict[str, Any]) -> str:
    """
    Format JSON payload with logical field ordering and high-density formatting.

    Orders fields logically:
    1. Message type and identifiers (type, timestamp, from, sender, to, id)
    2. RF/Mesh fields (hops_away, hop_start, rssi, snr, channel)
    3. Nested objects (payload, position, etc.)
    4. Other fields

    Uses spaces after commas and colons as preferred break points for CSS wrapping.
    Keeps related fields together on the same line for higher information density.

    Args:
        payload: Raw payload dictionary

    Returns:
        Formatted JSON string with logical ordering, compact format, and break points
    """
    if not isinstance(payload, dict):
        return json.dumps(payload, separators=(',', ':'))

    # Define field order priority (lower number = earlier in output)
    field_order = {
        'type': 1,
        'timestamp': 2,
        'from': 3,
        'sender': 4,
        'to': 5,
        'id': 6,
        'hops_away': 7,
        'hop_start': 8,
        'rssi': 9,
        'snr': 10,
        'channel': 11,
        'payload': 20,  # Nested objects come later
        'position': 21,
    }

    # Separate fields by priority
    ordered_fields = []
    nested_fields = []
    other_fields = []

    for key, value in payload.items():
        priority = field_order.get(key, 99)
        if priority < 20:
            ordered_fields.append((priority, key, value))
        elif isinstance(value, (dict, list)):
            nested_fields.append((priority, key, value))
        else:
            other_fields.append((priority, key, value))

    # Sort each group
    ordered_fields.sort(key=lambda x: (x[0], x[1]))
    nested_fields.sort(key=lambda x: (x[0], x[1]))
    other_fields.sort(key=lambda x: (x[0], x[1]))

    # Build ordered dictionary
    ordered_payload = {}
    for _, key, value in ordered_fields:
        ordered_payload[key] = value
    for _, key, value in nested_fields:
        ordered_payload[key] = value
    for _, key, value in other_fields:
        ordered_payload[key] = value

    # Format as compact JSON (no indentation for density)
    json_str = json.dumps(ordered_payload, separators=(',', ':'), ensure_ascii=False)

    # Add zero-width spaces after commas and colons as preferred break points
    # These are invisible but allow CSS word-wrap to break naturally at these points
    json_str = json_str.replace(',', f',{ZWSP}')
    json_str = json_str.replace(':', f':{ZWSP}')

    # Add newline before nested objects for better readability
    # Pattern: ,"key": { or ,"key": [
    import re
    # Build pattern with ZWSP - use string concatenation to avoid f-string parsing issues
    pattern = ',' + ZWSP + r'*("[\w]+":' + ZWSP + r'*[{[])'
    json_str = re.sub(pattern, r',\n\1', json_str)

    return json_str
