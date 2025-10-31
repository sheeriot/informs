**Status changed from `{{ old_status }}` to `{{ location.get_status_display }}`**

*   **ID**: {{ location.pk }}
*   **Source**: {{ location.get_source_display }}
*   **Coordinates**: `{{ location.latitude }}, {{ location.longitude }}`
*   **Address**: `{{ location.free_form_address|default:'N/A' }}`
