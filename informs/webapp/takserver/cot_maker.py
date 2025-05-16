"""
COT Message Builder that handles message creation based on ConfigParser COTINFO.
"""
from configparser import ConfigParser
from django.conf import settings
from aidrequests.models import FieldOp, AidRequest, AidLocation
from .cot_helper import make_cot, aidrequest_location
from icecream import ic


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
            # Get the field op
            field_op = await FieldOp.objects.aget(slug=self.field_op_slug)

            # Always build field op marker
            field_op_msg = await self.build_field_op_message(field_op)
            messages.append(field_op_msg)
            ic(f"Built field op marker for {self.field_op_slug}")

            # Build aid request messages if needed
            if self.mark_type == 'aid' and self.aid_request_ids:
                for aid_id in self.aid_request_ids:
                    try:
                        aid_msg = await self.build_aid_request_message(aid_id, field_op)
                        if aid_msg:
                            messages.append(aid_msg)
                            ic(f"Built aid request marker for ID {aid_id}")
                    except Exception as e:
                        ic(f"Error building message for aid request {aid_id}: {e}")
                        # Continue with other messages even if one fails

            return messages

        except Exception as e:
            ic(f"Error building messages: {e}")
            raise

    async def build_field_op_message(self, field_op):
        """Build COT message for field operation marker."""
        return make_cot(
            mark_type=self.mark_type,
            cot_icon='blob_dot_yellow',
            name=f'{field_op.slug.upper()}',
            uuid=f'FieldOp.{field_op.slug.upper()}',
            lat=field_op.latitude,
            lon=field_op.longitude,
            remarks=f'Field Op:\n{field_op.name}',
        )

    async def build_aid_request_message(self, aid_request_id, field_op):
        """Build COT message for an aid request."""
        try:
            # Get aid request with related locations
            aid_request = await AidRequest.objects.select_related('aid_type').aget(
                pk=aid_request_id,
                field_op=field_op  # Ensure it belongs to our field op
            )

            # Get all locations for this aid request
            locations = []
            async for location in AidLocation.objects.filter(aid_request=aid_request_id):
                locations.append(location)

            # Get the appropriate location
            status, location = aidrequest_location(locations)

            if not location:
                ic(f"No valid location found for aid request {aid_request_id}")
                return None

            # Build remarks
            remarks = []
            remarks.append(f"Aid Request #{aid_request.pk}")
            remarks.append(f"Type: {aid_request.aid_type.name}")
            remarks.append(f"Status: {aid_request.status.upper()}")
            if aid_request.priority:
                remarks.append(f"Priority: {aid_request.priority.upper()}")
            remarks.append(f"Location Status: {location.status.upper()}")
            if location.note:
                remarks.append(f"Location Note: {location.note}")
            if aid_request.aid_description:
                remarks.append(f"\nDescription:\n{aid_request.aid_description}")

            # Build the message
            return make_cot(
                mark_type=self.mark_type,
                cot_icon=aid_request.aid_type.cot_icon or 'marker',
                name=f'AR{aid_request.pk}',
                uuid=f'AidRequest.{aid_request.pk}',
                lat=location.latitude,
                lon=location.longitude,
                remarks="\n".join(remarks),
                parent_name=field_op.slug.upper(),
                parent_uuid=f'FieldOp.{field_op.slug.upper()}'
            )

        except AidRequest.DoesNotExist:
            ic(f"Aid request {aid_request_id} not found")
            return None
        except Exception as e:
            ic(f"Error building aid request message: {e}")
            raise
