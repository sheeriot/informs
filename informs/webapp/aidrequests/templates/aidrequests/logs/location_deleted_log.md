A location has been deleted.

- **ID**: `{{ location.pk }}`
- **Status**: `{{ location.get_status_display }}`
- **Source**: `{{ location.get_source_display }}`
- **Address**: `{{ location.free_form_address|default:"N/A" }}`
- **Coordinates**: `{{ location.latitude }}, {{ location.longitude }}`
