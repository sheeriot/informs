"""
COT Message Builder that handles message creation based on ConfigParser COTINFO.
"""
from configparser import ConfigParser
from django.conf import settings
from django.contrib.sites.models import Site
from asgiref.sync import sync_to_async
from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import make_cot, aidrequest_location
import logging
from icecream import ic
import xml.etree.ElementTree as ET
from datetime import datetime
import pytak
import platform
import json

logger = logging.getLogger(__name__)

class CotMaker:
    """Builds COT messages based on ConfigParser formatted COTINFO."""

    def __init__(self, cotinfo_string):
        """Initialize with COTINFO string in ConfigParser format."""
        self.config = ConfigParser()
        self.config.read_string(cotinfo_string)

        # Validate required sections and options
        if not self.config.has_section('cot'):
            raise ValueError("COTINFO missing required [cot] section")

        required_options = ['mark_type', 'field_op_slug']
        for option in required_options:
            if not self.config.has_option('cot', option):
                raise ValueError(f"COTINFO missing required option: {option}")

        self.mark_type = self.config.get('cot', 'mark_type')
        self.field_op_slug = self.config.get('cot', 'field_op_slug')

        # Get include_field_op_marker flag, defaulting to True if not present
        self.include_field_op_marker = self.config.getboolean('cot', 'include_field_op_marker', fallback=True)

        # Get optional aid request IDs if present
        self.aid_request_ids = []
        if self.config.has_option('cot', 'aid_request_ids'):
            aid_ids = self.config.get('cot', 'aid_request_ids')
            if aid_ids:
                self.aid_request_ids = [int(id.strip()) for id in aid_ids.split(',')]

    async def build_messages(self):
        """Build all COT messages based on configuration.

        Returns:
            list: List of COT message XML strings
        """
        messages = []

        try:
            # Get the field op using aget
            field_op = await FieldOp.objects.select_related('tak_server').aget(slug=self.field_op_slug)

            if not field_op.tak_server:
                logger.warning(f"FieldOp {self.field_op_slug} does not have an associated TAK server for connection details. No CoT messages will be built.")
                return []

            # Construct the full client UID using the local server name from Django Sites and ENV_NAME
            # Site.objects.get_current() typically does not have an official aget_current(), so sync_to_async is safer here.
            get_current_site_sync = sync_to_async(Site.objects.get_current, thread_sensitive=True)
            current_site = await get_current_site_sync()
            local_server_name_part = current_site.name
            env_suffix = settings.ENV_NAME

            if env_suffix and env_suffix != 'prod':
                full_client_uid_for_cot_maker = f"{local_server_name_part}.{env_suffix}"
            else:
                full_client_uid_for_cot_maker = local_server_name_part

            # Get the CoT type for the FieldOp's marker from the settings.
            field_op_cot_type = settings.COT_ICONS.get(settings.FIELD_OP_ICON_DEFAULT, 'a-f-G')

            if self.include_field_op_marker:
                field_op_msg = await self.build_field_op_message(field_op, full_client_uid_for_cot_maker, field_op_cot_type)
                if field_op_msg:
                    messages.append(field_op_msg)
                    # ic(f"Built field op marker for {self.field_op_slug} with client UID {full_client_uid_for_cot_maker}")

            # Build aid request messages if needed
            if self.mark_type == 'aid' and self.aid_request_ids:
                for aid_id in self.aid_request_ids:
                    try:
                        # Get AidRequest using aget
                        aid_request = await AidRequest.objects.select_related('aid_type').aget(pk=aid_id, field_op=field_op)

                        # Get related AidLocations asynchronously
                        locations = []
                        async for loc in AidLocation.objects.filter(aid_request_id=aid_request.id):
                            locations.append(loc)

                        status, location_obj = aidrequest_location(locations) # Assuming aidrequest_location is sync

                        if not location_obj:
                            logger.warning(f"No valid location found for aid request {aid_id}. Skipping marker.")
                            continue

                        # Pass the actual CoT type of the field_op marker for linking
                        aid_msg = await self.build_aid_request_message(aid_request, field_op, full_client_uid_for_cot_maker, field_op_cot_type, location_obj)
                        if aid_msg:
                            messages.append(aid_msg)
                            # ic(f"Built aid request marker for ID {aid_id}, linked to client {full_client_uid_for_cot_maker}")
                    except AidRequest.DoesNotExist:
                        logger.warning(f"Aid request {aid_id} not found for field_op {self.field_op_slug}. Skipping.")
                        continue
                    except Exception as e:
                        logger.error(f"Error building message for aid request {aid_id}: {e}")
                        # Continue with other messages even if one fails

            return messages

        except FieldOp.DoesNotExist:
            logger.error(f"FieldOp {self.field_op_slug} not found. Cannot build CoT messages.")
            # ic(f"Debug context for FieldOp {self.field_op_slug} not found.")
            raise
        except Exception as e:
            logger.error(f"Error building CoT messages for {self.field_op_slug}: {e}")
            # ic(f"Debug context for error building messages for {self.field_op_slug}: {e}")
            raise

    async def build_field_op_message(self, field_op, full_client_uid, field_op_cot_type):
        """Build COT message for field operation marker."""

        # Event UID for the map marker
        base_event_uid_identifier = field_op.slug.upper()
        if settings.ENV_NAME and settings.ENV_NAME != 'prod':
            base_event_uid_identifier = f"{field_op.slug.upper()}.{settings.ENV_NAME}"

        takv_signature = getattr(settings, 'TAKV_DEVICE_SIGNATURE', None)
        if takv_signature:
            field_op_event_uid = f"{base_event_uid_identifier}.{takv_signature}"
        else:
            field_op_event_uid = base_event_uid_identifier

        # Contact callsign and EUD identity for this FieldOp marker
        contact_callsign_for_marker = field_op.slug.upper()
        if settings.ENV_NAME and settings.ENV_NAME != 'prod':
            contact_callsign_for_marker = f"{field_op.slug.upper()}.{settings.ENV_NAME}"

        return make_cot(
            cot_type=field_op_cot_type,
            name=contact_callsign_for_marker,         # Contact callsign for this marker
            uuid=field_op_event_uid,                  # Unique event UID for the map marker
            lat=field_op.latitude,
            lon=field_op.longitude,
            remarks=f'Field Op: {field_op.name}\nSource Callsign: {contact_callsign_for_marker}',
            client_static_uid=contact_callsign_for_marker # EUD identity of the sender is marker's own callsign
        )

    async def build_aid_request_message(self, aid_request, field_op, full_client_uid, field_op_cot_type, location_obj):
        """Build COT message for an aid request, linked to the field_op marker."""
        try:
            remarks = []
            if aid_request.requester_full_name:
                remarks.append(f"Requester: {aid_request.requester_full_name}")

            remarks.extend([
                f"Aid Request: #{aid_request.pk}",
                f"Created: {aid_request.created_at.strftime('%Y-%m-%d %H:%M:%S')} UTC",
                f"Field Op: {field_op.name} ({field_op.slug})",
                f"Aid Type: {aid_request.aid_type.name}",
                f"Status: {aid_request.get_status_display()}",
                f"Priority: {aid_request.get_priority_display()}",
            ])

            if aid_request.group_size: remarks.append(f"Group Size: {aid_request.group_size}")

            if aid_request.full_address: remarks.append(f"Provided Address: {aid_request.full_address}")

            remarks.append("") # Add a blank line for spacing
            remarks.extend([
                f"Location Status: {location_obj.status.upper()}",
                f"Coordinates: {location_obj.longitude},{location_obj.latitude}"
            ])

            if location_obj.free_form_address: remarks.append(f"Geocoded Address: {location_obj.free_form_address}")

            if location_obj.note: remarks.append(f"Location Note: {location_obj.note}")

            if aid_request.aid_description: remarks.append(f"\nDescription:\n{aid_request.aid_description}")

            # Add the new fields to the remarks
            if aid_request.supplies_needed: remarks.append(f"\nSupplies Needed:\n{aid_request.supplies_needed}")
            if aid_request.medical_needs: remarks.append(f"\nMedical Needs:\n{aid_request.medical_needs}")
            if aid_request.welfare_check_info: remarks.append(f"\nWelfare Check:\n{aid_request.welfare_check_info}")
            if aid_request.additional_info: remarks.append(f"\nAdditional Info:\n{aid_request.additional_info}")

            if location_obj.geocode_json:
                try:
                    geocode_str = json.dumps(location_obj.geocode_json, indent=2)
                    remarks.append(f"\n--- Geocode Result ---\n{geocode_str}")
                except (TypeError, AttributeError):
                    remarks.append(f"\n--- Geocode Result ---\n{str(location_obj.geocode_json)}")

            # Base for this Aid Request marker's own callsign. This can change if aid_type changes.
            aid_request_callsign_identifier = f"{field_op.slug}.{aid_request.aid_type.slug}.{aid_request.pk}"
            contact_callsign_for_marker = aid_request_callsign_identifier
            if settings.ENV_NAME and settings.ENV_NAME != 'prod':
                contact_callsign_for_marker = f"{aid_request_callsign_identifier}.{settings.ENV_NAME}"

            # Base for this Aid Request marker's event UID. This must be stable.
            aid_request_uid_identifier = f"{field_op.slug}.{aid_request.pk}"
            event_uid_base_for_marker = aid_request_uid_identifier
            if settings.ENV_NAME and settings.ENV_NAME != 'prod':
                event_uid_base_for_marker = f"{aid_request_uid_identifier}.{settings.ENV_NAME}"

            # Unique event UID for this aid request map marker (includes TAKV signature)
            event_uid_for_marker = event_uid_base_for_marker
            takv_signature = getattr(settings, 'TAKV_DEVICE_SIGNATURE', None)
            if takv_signature:
                event_uid_for_marker = f"{event_uid_base_for_marker}.{takv_signature}"

            # Event UID of the parent FieldOp map marker (for linking the map items)
            parent_marker_base_event_uid = field_op.slug.upper()
            if settings.ENV_NAME and settings.ENV_NAME != 'prod':
                parent_marker_base_event_uid = f"{field_op.slug.upper()}.{settings.ENV_NAME}"

            parent_marker_event_uid = parent_marker_base_event_uid # Base for parent UID
            if takv_signature: # Use the same takv_signature for consistency if present
                parent_marker_event_uid = f"{parent_marker_base_event_uid}.{takv_signature}"

            # Callsign of the parent FieldOp marker (for link_parent_callsign)
            parent_fo_contact_callsign = field_op.slug.upper()
            if settings.ENV_NAME and settings.ENV_NAME != 'prod':
                parent_fo_contact_callsign = f"{field_op.slug.upper()}.{settings.ENV_NAME}"

            return make_cot(
                cot_icon=aid_request.aid_type.cot_icon or 'marker',
                name=contact_callsign_for_marker,     # This AidRequest marker's own callsign
                uuid=event_uid_for_marker,            # This AidRequest marker's unique event UID (with TAKV)
                lat=location_obj.latitude,
                lon=location_obj.longitude,
                remarks="\n".join(remarks),
                client_static_uid=contact_callsign_for_marker, # Sender EUD is this marker's own callsign
                link_to_client_uid=parent_marker_event_uid,         # Links to parent FieldOp *map marker event UID*
                link_type=field_op_cot_type,
                link_parent_callsign=parent_fo_contact_callsign # Links to parent FieldOp *contact callsign*
            )

        except AidRequest.DoesNotExist:
            logger.warning(f"Aid request {aid_request.pk} not found during detail build. Should have been caught earlier.")
            return None
        except Exception as e:
            logger.error(f"Error building detailed aid request message for {aid_request.pk}: {e}")
            # ic(f"Debug context for error building detailed aid request message {aid_request.pk}: {e}")
            raise
