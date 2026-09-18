"""Small, dependency-free safeguards for the public prototype submission endpoint."""
import unicodedata

from starlette.responses import JSONResponse


def report_fingerprint(report):
    def text(value):
        return " ".join(unicodedata.normalize("NFKC", value).casefold().split())

    return (text(report.location), text(report.description), report.category,
            report.blockage, report.standing_water, report.nearby_buildings,
            round(report.latitude, 6), round(report.longitude, 6))


class ReportBodyLimit:
    """Bound the body before JSON parsing, including requests with no length header."""

    def __init__(self, app, max_bytes=16_384):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if (scope["type"] != "http" or scope["method"] != "POST"
                or scope["path"].rstrip("/") != "/reports"):
            return await self.app(scope, receive, send)

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                response = JSONResponse({"detail": "The submission is too large. Please shorten it and try again."}, status_code=413)
                return await response(scope, receive, send)
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
