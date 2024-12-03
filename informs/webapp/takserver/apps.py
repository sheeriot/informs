from django.apps import AppConfig
# from icecream import ic


class TakServerConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'takserver'

    def ready(self):
        import takserver.signals  # noqa: F401
