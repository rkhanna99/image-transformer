from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from typing import Any


@dataclass
class MetadataImagePayload:
    address: str | None = None
    latitude: str | None = None
    longitude: str | None = None
    photoName: str | None = None
    aspectRatio: str = "Default"
    customAspectRatio: str | None = None

    def as_form(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MetadataBatchPayload:
    images: list[MetadataImagePayload]


@dataclass
class BorderJobPayload:
    borderSize: int = 0
    aspectRatio: str = "Default"


def _load_payload_json(raw_payload: str | None) -> dict[str, Any] | None:
    if not raw_payload:
        return None
    try:
        return json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid payload JSON") from exc


def parse_single_metadata_payload(form) -> MetadataImagePayload:
    payload = _load_payload_json(form.get("payload"))
    if payload is not None:
        return MetadataImagePayload(
            address=payload.get("address"),
            latitude=payload.get("latitude"),
            longitude=payload.get("longitude"),
            photoName=payload.get("photoName"),
            aspectRatio=payload.get("aspectRatio") or "Default",
            customAspectRatio=payload.get("customAspectRatio"),
        )

    return MetadataImagePayload(
        address=form.get("address"),
        latitude=form.get("latitude"),
        longitude=form.get("longitude"),
        photoName=form.get("photoName"),
        aspectRatio=form.get("aspectRatio") or "Default",
        customAspectRatio=form.get("customAspectRatio"),
    )


def parse_batch_metadata_payload(form, image_count: int) -> MetadataBatchPayload:
    payload = _load_payload_json(form.get("payload"))
    if payload is not None:
        images = payload.get("images", [])
        return MetadataBatchPayload(
            images=[
                MetadataImagePayload(
                    address=image.get("address"),
                    latitude=image.get("latitude"),
                    longitude=image.get("longitude"),
                    photoName=image.get("photoName"),
                    aspectRatio=image.get("aspectRatio") or "Default",
                    customAspectRatio=image.get("customAspectRatio"),
                )
                for image in images
            ]
        )

    return MetadataBatchPayload(
        images=[
            MetadataImagePayload(
                address=form.get(f"address[{index}]"),
                latitude=form.get(f"latitude[{index}]"),
                longitude=form.get(f"longitude[{index}]"),
                photoName=form.get(f"photoName[{index}]"),
                aspectRatio=form.get(f"aspectRatio[{index}]") or "Default",
                customAspectRatio=form.get(f"customAspectRatio[{index}]"),
            )
            for index in range(image_count)
        ]
    )


def parse_border_payload(form) -> BorderJobPayload:
    payload = _load_payload_json(form.get("payload"))
    if payload is not None:
        return BorderJobPayload(
            borderSize=int(payload.get("borderSize", 0)),
            aspectRatio=payload.get("aspectRatio") or "Default",
        )

    return BorderJobPayload(
        borderSize=int(form.get("borderSize", 0)),
        aspectRatio=form.get("aspectRatio") or "Default",
    )
