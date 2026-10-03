import re

import django_filters
from django.db import transaction
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core import clock
from core.domain.constants import EMAIL_CATEGORIES, is_opportunity_category
from core.domain.match import explain_match
from opportunities.models import Opportunity
from opportunities.serializers import OpportunitySerializer, opportunities_for

from .serializers import EmailSerializer, emails_for


class EmailFilter(django_filters.FilterSet):
    category = django_filters.MultipleChoiceFilter(
        field_name="classification__category", choices=[(c, c) for c in EMAIL_CATEGORIES]
    )
    opportunity = django_filters.UUIDFilter(field_name="opportunity_id")
    archived = django_filters.BooleanFilter()
    read = django_filters.BooleanFilter()


class EmailViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    /api/emails/ — the user's relevant emails, newest first.
    Filters: ?category=Job&category=Hackathon, ?opportunity=<id>, ?archived=, ?read=, ?q= (search).
    PATCH {read, archived}. POST /api/emails/<id>/extract/.
    """

    serializer_class = EmailSerializer
    filterset_class = EmailFilter
    search_fields = ["sender", "sender_email", "subject", "snippet"]
    ordering_fields = ["received_at"]
    ordering = ["-received_at"]
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        return emails_for(self.request.user)

    @action(detail=True, methods=["post"])
    def extract(self, request, pk=None):
        """
        Stage 8 runs the AI extractor here. Until then it uses only what the
        email itself contains (everything else stays null) and returns
        {"opportunity": null} when the email isn't an opportunity.
        """
        with transaction.atomic():
            email = self.get_object()
            if email.opportunity_id:
                opp = opportunities_for(request.user).get(pk=email.opportunity_id)
                return Response({"opportunity": OpportunitySerializer(opp).data})
            category = email.classification.category if hasattr(email, "classification") else "Other"
            if not is_opportunity_category(category):
                return Response({"opportunity": None})
            relevance = email.classification.relevance
            title = re.sub(r"^(invitation|reminder|new role for you|fwd?|re)\s*:\s*", "", email.subject, flags=re.I).strip()
            user = request.user
            opp = Opportunity.objects.create(
                user=user,
                title=title,
                organization=email.sender,
                type=category,
                priority="High" if relevance >= 85 else "Medium" if relevance >= 70 else "Low",
                match_score=relevance,
                discovered_at=clock.now(),
                summary=email.snippet or None,
                match_reasons=explain_match(
                    {"title": title, "type": category, "skills": [], "eligibility": None},
                    {"interests": user.interests, "skills": user.skills, "experienceLevel": user.experience_level},
                ),
            )
            email.opportunity = opp
            email.save(update_fields=["opportunity"])
        return Response({"opportunity": OpportunitySerializer(opportunities_for(user).get(pk=opp.pk)).data}, status=201)
