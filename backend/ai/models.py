from django.db import models


class AIUsage(models.Model):
    """Requests per provider per quota day, so the free tier's daily limit is never exceeded."""

    provider = models.CharField(max_length=16)
    #: The provider's quota day (Gemini resets at midnight Pacific time).
    day = models.DateField()
    requests = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["provider", "day"], name="uniq_ai_usage_day")]
