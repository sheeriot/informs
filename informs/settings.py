from pathlib import Path
import os
import environ
from dotenv import load_dotenv

# Explicitly load the .env file from the project root
# This ensures that the .env file is found regardless of where the app is running
# from.
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# BASE_DIR = Path(__file__).resolve().parent.parent
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'crispy_bootstrap5',
]

# --- TAK Server / CoT Settings ---
# Static mapping of icon names to CoT event types
COT_ICONS = {
    'person': 'a-f-G-E-V-C',
    'person_friendly': 'a-f-G-E-V-C',
    'person_hostile': 'a-h-G-E-V-C',
    'person_neutral': 'a-n-G-E-V-C',
    'person_unknown': 'a-u-G-E-V-C',
    'vehicle': 'a-f-G-E-V-C-U',
    'vehicle_friendly': 'a-f-G-E-V-C-U',
    'vehicle_hostile': 'a-h-G-E-V-C-U',
    'vehicle_neutral': 'a-n-G-E-V-C-U',
    'vehicle_unknown': 'a-u-G-E-V-C-U',
    'supply': 'a-n-G-U-C-S',
    'heli': 'a-f-A-M-H-H',
    'evac': 'a-f-G-E-V-A',
    'food': 'a-n-G-U-C-S-F',
    'water': 'a-n-G-U-C-S-W',
    'shelter': 'a-n-G-U-C-S-S',
    'medical': 'a-n-G-U-C-M',
    'medevac': 'a-f-G-E-V-A-M',
    'civilian': 'a-n-G-E-V-C-C',
    'search': 'a-f-G-U-C-R',
    'blob_dot_yellow': 'a-u-G-U-C-F-H',
    'question': 'a-u-G-U-C',
}
# Define the path to the takv device signature file
TAKV_DEVICE_SIGNATURE_PATH = os.path.join(BASE_DIR, 'informs', 'webapp', 'takserver', 'takv_device_signature.txt')

# Read the signature from the file
try:
    with open(TAKV_DEVICE_SIGNATURE_PATH, 'r') as f:
        TAKV_DEVICE_SIGNATURE = f.read().strip()
except FileNotFoundError:
    TAKV_DEVICE_SIGNATURE = None
    print(f"Warning: takv_device_signature.txt not found at {TAKV_DEVICE_SIGNATURE_PATH}")
except Exception as e:
    TAKV_DEVICE_SIGNATURE = None
    print(f"Error reading takv_device_signature.txt: {e}")
