import django_filters
from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from core import clock
from core.data import interview_dicts, opportunity_dicts
from core.domain.calendar import build_calendar_items
from core.domain.constants import OPPORTUNITY_TYPES
from mail.models import Email

from .models import Application, Deadline, HiddenSender, Opportunity, SavedItem
from .serializers import (
    ApplicationSerializer,
    DeadlineSerializer,
    OpportunitySerializer,
    SavedItemSerializer,
    UserScopedPK,
    opportunities_for,
)


class OpportunityFilter(django_filters.FilterSet):
    type = django_filters.MultipleChoiceFilter(choices=[(t, t) for t in OPPORTUNITY_TYPES])
    priority = django_filters.MultipleChoiceFilter(choices=[(p, p) for p in ("High", "Medium", "Low")])
    status = django_filters.ChoiceFilter(
        choices=[("applied", "applied"), ("in_progress", "in_progress"), ("none", "none")], method="filter_status"
    )
    saved = django_filters.BooleanFilter(field_name="is_saved")
    dismissed = django_filters.BooleanFilter()

    def filter_status(self, qs, name, value):
        return qs.filter(application__isnull=True) if value == "none" else qs.filter(application__status=value)


class OpportunityViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    /api/opportunities/ — dismissed ("Not interested") ones are hidden unless
    ?dismissed=true. Filters: type, priority, status, saved; ?q= search;
    ?ordering=-match_score|deadline__due_date|-discovered_at. PATCH {reminderSet, dismissed}.
    """

    serializer_class = OpportunitySerializer
    filterset_class = OpportunityFilter
    search_fields = ["title", "organization", "type", "location"]
    ordering_fields = ["match_score", "discovered_at", "deadline__due_date", "priority"]
    ordering = ["-match_score", "created_at"]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        qs = opportunities_for(self.request.user)
        if self.action == "list" and "dismissed" not in self.request.query_params:
            qs = qs.filter(dismissed=False)
        return qs

    def perform_update(self, serializer):
        serializer.save()
        # Re-read with the annotations the serializer needs.
        serializer.instance = self.get_queryset().get(pk=serializer.instance.pk)


class DeadlineFilter(django_filters.FilterSet):
    start = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    end = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")
    kind = django_filters.ChoiceFilter(choices=Deadline.Kind.choices)

    class Meta:
        model = Deadline
        fields = ["start", "end", "kind"]


class DeadlineListView(mixins.ListModelMixin, viewsets.GenericViewSet):
    """GET /api/deadlines/ — deadlines of active opportunities, soonest first. ?start=&end= (YYYY-MM-DD), ?kind=."""

    serializer_class = DeadlineSerializer
    filterset_class = DeadlineFilter
    ordering_fields = ["due_date"]
    ordering = ["due_date"]

    def get_queryset(self):
        return Deadline.objects.filter(user=self.request.user, opportunity__dismissed=False).select_related("opportunity")


class CalendarView(APIView):
    """GET /api/deadlines/calendar/ — deadlines (all-day), interviews (timed) and reminders."""

    def get(self, request):
        now = clock.user_now(request)
        return Response(build_calendar_items(opportunity_dicts(request.user), interview_dicts(request.user), now))


class ApplicationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    /api/applications/ — POST {opportunityId, status} creates or updates the
    application (idempotent) and returns it with the updated opportunity.
    """

    serializer_class = ApplicationSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return Application.objects.filter(user=self.request.user).select_related("opportunity")

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        opp, new_status = s.validated_data["opportunity"], s.validated_data["status"]
        ts = clock.now()
        with transaction.atomic():
            app, created = Application.objects.select_for_update().get_or_create(
                user=request.user,
                opportunity=opp,
                defaults={"status": new_status, "started_at": ts, "applied_at": ts if new_status == "applied" else None},
            )
            if not created and app.status != new_status:
                app.status = new_status
                app.applied_at = ts if new_status == "applied" else None
                app.save(update_fields=["status", "applied_at"])
        fresh = opportunities_for(request.user).get(pk=opp.pk)
        return Response(
            {**ApplicationSerializer(app, context={"request": request}).data, "opportunity": OpportunitySerializer(fresh).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class SavedView(APIView):
    """
    /api/saved/ — GET lists bookmarks; POST {opportunityId | emailId} saves
    (idempotent); DELETE ?opportunityId=<id> or ?emailId=<id> unsaves.
    """

    def get(self, request):
        items = SavedItem.objects.filter(user=request.user)
        return Response(SavedItemSerializer(items, many=True, context={"request": request}).data)

    def post(self, request):
        s = SavedItemSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        target = {k: v for k, v in s.validated_data.items() if v is not None}
        try:
            with transaction.atomic():
                item, created = SavedItem.objects.get_or_create(user=request.user, **target)
        except IntegrityError:  # concurrent double-save
            item, created = SavedItem.objects.get(user=request.user, **target), False
        return Response(SavedItemSerializer(item, context={"request": request}).data, status=201 if created else 200)

    def delete(self, request):
        s = SavedItemSerializer(
            data={k: request.query_params.get(k) for k in ("opportunityId", "emailId") if request.query_params.get(k)},
            context={"request": request},
        )
        s.is_valid(raise_exception=True)
        target = {k: v for k, v in s.validated_data.items() if v is not None}
        SavedItem.objects.filter(Q(user=request.user), **target).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HiddenSenderSerializer(serializers.ModelSerializer):
    senderEmail = serializers.EmailField(source="sender_email", read_only=True)
    senderName = serializers.CharField(source="sender_name", read_only=True)
    hiddenOpportunityIds = serializers.JSONField(source="hidden_opportunity_ids", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = HiddenSender
        fields = ["id", "senderEmail", "senderName", "hiddenOpportunityIds", "createdAt"]


class HideSenderRequest(serializers.Serializer):
    opportunityId = UserScopedPK(source="opportunity", queryset=Opportunity.objects.all())


class HiddenSenderListView(APIView):
    """
    GET /api/hidden-senders/ — senders the user chose to hide.
    POST {opportunityId} — "Hide all from this sender": hides every opportunity that came from the
    sender of that opportunity's first email, and skips their future emails.
    """

    def get(self, request):
        return Response(HiddenSenderSerializer(HiddenSender.objects.filter(user=request.user), many=True).data)

    def post(self, request):
        s = HideSenderRequest(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        opp = s.validated_data["opportunity"]
        first = Email.objects.filter(user=request.user, opportunity=opp).order_by("received_at").first()
        if not first:
            raise ValidationError({"opportunityId": "This opportunity has no source email."})
        with transaction.atomic():
            ids = list(
                Opportunity.objects.filter(user=request.user, dismissed=False, emails__sender_email=first.sender_email)
                .distinct()
                .values_list("id", flat=True)
            )
            Opportunity.objects.filter(id__in=ids).update(dismissed=True)
            rule, created = HiddenSender.objects.get_or_create(
                user=request.user, sender_email=first.sender_email, defaults={"sender_name": first.sender}
            )
            rule.hidden_opportunity_ids = list(dict.fromkeys([*rule.hidden_opportunity_ids, *map(str, ids)]))
            rule.save(update_fields=["hidden_opportunity_ids"])
        return Response(HiddenSenderSerializer(rule).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class HiddenSenderDetailView(APIView):
    """DELETE /api/hidden-senders/<id>/ — "Show again": restores what the rule hid and stops skipping the sender."""

    def delete(self, request, pk):
        rule = get_object_or_404(HiddenSender, pk=pk, user=request.user)
        with transaction.atomic():
            restored = list(
                Opportunity.objects.filter(user=request.user, id__in=rule.hidden_opportunity_ids, dismissed=True).values_list(
                    "id", flat=True
                )
            )
            Opportunity.objects.filter(id__in=restored).update(dismissed=False)
            rule.delete()
        return Response({"restoredOpportunityIds": [str(i) for i in restored]})
