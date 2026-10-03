"""Per-user snapshots in API shape, fed to the domain functions in core.domain."""

from mail.serializers import EmailSerializer, emails_for
from opportunities.models import Interview
from opportunities.serializers import InterviewSerializer, OpportunitySerializer, opportunities_for


def opportunity_dicts(user) -> list[dict]:
    # created_at order = seed / discovery order, used for stable tie-breaks.
    return OpportunitySerializer(opportunities_for(user).order_by("created_at", "id"), many=True).data


def email_dicts(user) -> list[dict]:
    return EmailSerializer(emails_for(user).order_by("-received_at"), many=True).data


def interview_dicts(user) -> list[dict]:
    return InterviewSerializer(Interview.objects.filter(user=user).order_by("start"), many=True).data
