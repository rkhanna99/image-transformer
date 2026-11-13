from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import math
import re
from typing import Any


_RATIO = re.compile(r"^([1-9][0-9]*):([1-9][0-9]*)$")


@dataclass
class MetadataImagePayload:
    address: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    photoName: str | None = None
    aspectRatio: str = "Default"
    customAspectRatio: str | None = None
    clientImageId: str | None = None

    def as_form(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MetadataBatchPayload:
    images: list[MetadataImagePayload]


@dataclass
class BorderJobPayload:
    borderSize: int = 0
    aspectRatio: str = "Default"
    clientImageIds: list[str] | None = None


def _load_payload_json(raw_payload: str | None) -> dict[str, Any] | None:
    if raw_payload is None or raw_payload == "":
        return None
    try:
        payload = json.loads(raw_payload)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError("Invalid payload JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a JSON object")
    return payload


def _optional_text(value: Any, name: str) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError(f"{name} must be text")
    return value.strip() or None


def _client_id(value: Any) -> str | None:
    result = _optional_text(value, "clientImageId")
    if result is not None and len(result) > 128:
        raise ValueError("clientImageId must be 128 characters or fewer")
    return result


def validate_ratio(value: Any, custom_value: Any = None) -> str:
    if not isinstance(value, str):
        raise ValueError("Aspect ratio must be text")
    value = value.strip()
    if value in {"Default", "DEFAULT"}:
        return "Default"
    if value == "Custom":
        value = _optional_text(custom_value, "customAspectRatio") or ""
    match = _RATIO.fullmatch(value)
    if not match:
        raise ValueError("Aspect ratio must be Default or a positive W:H ratio")
    # Keep Pillow's requested dimensions finite without narrowing ordinary print sizes.
    width, height = (int(part) for part in match.groups())
    if width > 100_000 or height > 100_000:
        raise ValueError("Aspect ratio values must be 100000 or less")
    return f"{width}:{height}"


def _validate_coordinates(latitude: str | None, longitude: str | None) -> None:
    if (latitude is None) != (longitude is None):
        raise ValueError("Enter both latitude and longitude, or leave both blank")
    if latitude is None:
        return
    try:
        lat, lon = float(latitude), float(longitude)
    except (TypeError, ValueError) as exc:
        raise ValueError("Latitude and longitude must be numbers") from exc
    if not math.isfinite(lat) or not -90 <= lat <= 90:
        raise ValueError("Latitude must be between -90 and 90")
    if not math.isfinite(lon) or not -180 <= lon <= 180:
        raise ValueError("Longitude must be between -180 and 180")


def _metadata_image(data: Any) -> MetadataImagePayload:
    if not isinstance(data, dict):
        raise ValueError("Each metadata image must be a JSON object")
    payload = MetadataImagePayload(
        address=_optional_text(data.get("address"), "address"),
        latitude=_optional_text(data.get("latitude"), "latitude"),
        longitude=_optional_text(data.get("longitude"), "longitude"),
        photoName=_optional_text(data.get("photoName"), "photoName"),
        aspectRatio=validate_ratio(data.get("aspectRatio", "Default"), data.get("customAspectRatio")),
        customAspectRatio=_optional_text(data.get("customAspectRatio"), "customAspectRatio"),
        clientImageId=_client_id(data.get("clientImageId")),
    )
    _validate_coordinates(payload.latitude, payload.longitude)
    if not payload.latitude and not payload.address:
        raise ValueError("Enter an address or a complete latitude and longitude pair")
    if payload.aspectRatio != "Default" and data.get("aspectRatio") == "Custom":
        payload.aspectRatio = "Custom"
        payload.customAspectRatio = validate_ratio(data.get("customAspectRatio"))
    return payload


def parse_single_metadata_payload(form) -> MetadataImagePayload:
    payload = _load_payload_json(form.get("payload"))
    if payload is not None:
        return _metadata_image(payload)
    return _metadata_image({
        "address": form.get("address"),
        "latitude": form.get("latitude"),
        "longitude": form.get("longitude"),
        "photoName": form.get("photoName"),
        "aspectRatio": form.get("aspectRatio") or "Default",
        "customAspectRatio": form.get("customAspectRatio"),
    })


def parse_batch_metadata_payload(form, image_count: int) -> MetadataBatchPayload:
    payload = _load_payload_json(form.get("payload"))
    if payload is not None:
        images = payload.get("images")
        if not isinstance(images, list):
            raise ValueError("Payload images must be a list")
        result = MetadataBatchPayload(images=[_metadata_image(image) for image in images])
    else:
        result = MetadataBatchPayload(images=[
            _metadata_image({
                "address": form.get(f"address[{index}]"),
                "latitude": form.get(f"latitude[{index}]"),
                "longitude": form.get(f"longitude[{index}]"),
                "photoName": form.get(f"photoName[{index}]"),
                "aspectRatio": form.get(f"aspectRatio[{index}]") or "Default",
                "customAspectRatio": form.get(f"customAspectRatio[{index}]"),
            })
            for index in range(image_count)
        ])
    if len(result.images) != image_count:
        raise ValueError("Payload image count must match uploaded image count")
    client_ids = [image.clientImageId for image in result.images if image.clientImageId is not None]
    if len(client_ids) != len(set(client_ids)):
        raise ValueError("clientImageId values must be unique within a batch")
    return result


def parse_border_payload(form, image_count: int | None = None) -> BorderJobPayload:
    payload = _load_payload_json(form.get("payload"))
    if payload is None:
        payload = {"borderSize": form.get("borderSize", "0"), "aspectRatio": form.get("aspectRatio") or "Default"}

    border_size = payload.get("borderSize", 0)
    if isinstance(border_size, bool) or not isinstance(border_size, (int, str)):
        raise ValueError("Border size must be a whole number from 0 to 50")
    try:
        text_size = str(border_size).strip()
        if not re.fullmatch(r"[0-9]+", text_size):
            raise ValueError
        parsed_size = int(text_size)
    except (TypeError, ValueError):
        raise ValueError("Border size must be a whole number from 0 to 50") from None
    if not 0 <= parsed_size <= 50:
        raise ValueError("Border size must be a whole number from 0 to 50")

    ratio = validate_ratio(payload.get("aspectRatio", "Default"))
    raw_ids = payload.get("clientImageIds")
    ids = None
    if raw_ids is not None:
        if not isinstance(raw_ids, list) or any(not isinstance(value, str) or not value or len(value) > 128 for value in raw_ids):
            raise ValueError("clientImageIds must be a list of non-empty IDs")
        if len(raw_ids) != len(set(raw_ids)):
            raise ValueError("clientImageIds values must be unique within a batch")
        if image_count is not None and len(raw_ids) != image_count:
            raise ValueError("clientImageIds count must match uploaded image count")
        ids = raw_ids
    return BorderJobPayload(borderSize=parsed_size, aspectRatio=ratio, clientImageIds=ids)
