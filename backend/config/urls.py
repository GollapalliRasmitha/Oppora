from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from accounts import views as accounts
from core import views as core
from core.api import json_error
from mail.views import EmailViewSet
from notifications import views as notifications
from opportunities import views as opportunities

router = DefaultRouter()
router.include_root_view = False
router.register("emails", EmailViewSet, basename="email")
router.register("opportunities", opportunities.OpportunityViewSet, basename="opportunity")
router.register("applications", opportunities.ApplicationViewSet, basename="application")
router.register("deadlines", opportunities.DeadlineListView, basename="deadline")

auth = [
    path("csrf/", accounts.CsrfView.as_view()),
    path("dev-login/", accounts.DevLoginView.as_view()),
    path("logout/", accounts.LogoutView.as_view()),
    path("me/", accounts.MeView.as_view()),
    path("me/data/", accounts.MyDataView.as_view()),
    path("gmail/", accounts.GmailStatusView.as_view()),
    path("gmail/connect/", accounts.GmailConnectView.as_view()),
    path("gmail/disconnect/", accounts.GmailDisconnectView.as_view()),
    path("google/login/", accounts.google_login),
    path("google/callback/", accounts.google_callback),
]

api = [
    path("auth/", include(auth)),
    path("preferences/", accounts.PreferencesView.as_view()),
    path("deadlines/calendar/", opportunities.CalendarView.as_view()),
    path("saved/", opportunities.SavedView.as_view()),
    path("hidden-senders/", opportunities.HiddenSenderListView.as_view()),
    path("hidden-senders/<uuid:pk>/", opportunities.HiddenSenderDetailView.as_view()),
    path("notifications/", notifications.NotificationListView.as_view()),
    path("notifications/clear/", notifications.NotificationClearView.as_view()),
    path("notifications/<uuid:pk>/read/", notifications.NotificationReadView.as_view()),
    path("insights/", core.InsightsView.as_view()),
    path("insights/dashboard/", core.DashboardView.as_view()),
    path("sync/", core.SyncView.as_view()),
    path("assistant/", core.AssistantView.as_view()),
    path("", include(router.urls)),
    # Unknown /api/* paths get the same JSON error shape as everything else.
    re_path(r"^.*$", lambda request, *a, **k: json_error(404, "not_found", "Not found.")),
]

urlpatterns = [path("api/", include(api))]


def handler404(request, exception=None):
    return json_error(404, "not_found", "Not found.")


def handler500(request):
    return json_error(500, "server_error", "Something went wrong on our side. Try again in a moment.")
