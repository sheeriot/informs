import requests
import os

# --- Configuration ---
# IMPORTANT: In your terminal, set your Azure Maps Key as an environment variable
# export AZURE_MAPS_KEY='YourKeyHere'
AZURE_MAPS_KEY = os.environ.get("AZURE_MAPS_KEY")
if not AZURE_MAPS_KEY:
    raise ValueError("Please set the AZURE_MAPS_KEY environment variable before running this script.")

# --- Pin and Path Definitions ---
# Coordinates for testing
fieldop_lon, fieldop_lat = -79.38050, 43.64530
aid1_lon, aid1_lat = -79.56551, 43.64388

# Center and Zoom (approximated for testing)
center_lon = (fieldop_lon + aid1_lon) / 2
center_lat = (fieldop_lat + aid1_lat) / 2
zoom = 10

# Correct Pin Format: style|modifiers||'label'lon lat (no space after label)
pin1 = f"default|co008000|lcFFFFFF||'OP'{fieldop_lon} {fieldop_lat}"
pin2 = f"default|coFFFF00|lc000000||'AID'{aid1_lon} {aid1_lat}"

path = f"lcFF1493||{fieldop_lon} {fieldop_lat}|{aid1_lon} {aid1_lat}"

# --- API Request ---
# Using the tilesetId-based endpoint as requested
url = "https://atlas.microsoft.com/map/static"

# Build parameters as a list of tuples to support multiple 'pins' keys.
# This is the correct way to let the 'requests' library handle encoding.
params_list = [
    ('subscription-key', AZURE_MAPS_KEY),
    ('api-version', '2024-04-01'),
    ('tilesetId', 'microsoft.base.road'),
    ('zoom', zoom),
    ('center', f'{center_lon},{center_lat}'),
    ('width', 600),
    ('height', 600),
    ('pins', pin1),
    ('pins', pin2),
    ('path', path),
]


# --- Execute and Debug ---
try:
    # Use a session for clearer debugging
    session = requests.Session()
    request = requests.Request('GET', url, params=params_list)
    prepared_request = session.prepare_request(request)

    print("--- Request ---")
    print(f"Final URL Sent to Server:\n{prepared_request.url}")
    print("---------------")

    response = session.send(prepared_request)
    response.raise_for_status()

    # --- Handle Response ---
    print("\n--- Response ---")
    print(f"Status Code: {response.status_code}")
    print("Content-Type:", response.headers.get('Content-Type'))
    print("----------------")

    if 'image/png' in response.headers.get('Content-Type', ''):
        output_path = "map_debug_output.png"
        with open(output_path, 'wb') as f:
            f.write(response.content)
        print(f"SUCCESS: Map image saved to '{output_path}'")
    else:
        print(f"ERROR: Response was not a PNG image. Body:\n{response.text}")

except requests.exceptions.HTTPError as e:
    print("\n--- HTTP ERROR ---")
    print(f"Status Code: {e.response.status_code}")
    print(f"Response Body: {e.response.text}")
    print("------------------")
except Exception as e:
    print(f"\n--- An unexpected error occurred ---")
    print(e)
    print("------------------------------------")
