Email notifications for Aid Request #{{ aid_request.pk }} in Field Op '{{ aid_request.field_op.name }}' were sent to the following recipients:

{% for recipient in recipients %}
*   {{ recipient }}
{% endfor %}

<details>
<summary>View Email Content</summary>

---
{{ email_body | safe }}
---
</details>
