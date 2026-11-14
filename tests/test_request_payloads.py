import unittest
import json

from services.request_payloads import parse_batch_metadata_payload, parse_border_payload, parse_single_metadata_payload


class RequestPayloadTests(unittest.TestCase):
    def test_metadata_design_defaults_and_explicit_false_in_json_and_legacy_forms(self):
        for form in ({"address": "A"}, {"payload": '{"address":"A"}'}):
            parsed = parse_single_metadata_payload(form)
            self.assertEqual((parsed.overlayStyle, parsed.themeTone, parsed.showGpsCoordinates, parsed.showColorStrip), ("original", "linen-light", True, True))
        for form in (
            {"payload": json.dumps({"address": "A", "overlayStyle": "film", "themeTone": "slate-dark", "showGpsCoordinates": False, "showColorStrip": False})},
            {"address": "A", "overlayStyle": "film", "themeTone": "slate-dark", "showGpsCoordinates": "false", "showColorStrip": "false"},
        ):
            parsed = parse_single_metadata_payload(form)
            self.assertEqual((parsed.overlayStyle, parsed.themeTone, parsed.showGpsCoordinates, parsed.showColorStrip), ("film", "slate-dark", False, False))

    def test_metadata_design_rejects_invalid_json_types_and_values(self):
        for name, invalid in {
            "overlayStyle": ["gallery-sheet", "", None, True, [], {}],
            "themeTone": ["dark", "", None, True, [], {}],
            "showGpsCoordinates": ["false", "true", 0, 1, None, [], {}],
            "showColorStrip": ["false", "true", 0, 1, None, [], {}],
        }.items():
            for value in invalid:
                with self.subTest(name=name, value=value), self.assertRaisesRegex(ValueError, name):
                    parse_single_metadata_payload({"payload": json.dumps({"address": "A", name: value})})
        for value in ("", "False", "0", "1", "yes"):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "showColorStrip"):
                parse_single_metadata_payload({"address": "A", "showColorStrip": value})

    def test_metadata_batch_design_options_are_per_image_in_both_contracts(self):
        forms = [
            {"payload": json.dumps({"images": [{"address": "A", "overlayStyle": "card", "showGpsCoordinates": False}, {"address": "B", "overlayStyle": "overlay", "showColorStrip": False}]})},
            {"address[0]": "A", "overlayStyle[0]": "card", "showGpsCoordinates[0]": "false", "address[1]": "B", "overlayStyle[1]": "overlay", "showColorStrip[1]": "false"},
        ]
        for form in forms:
            images = parse_batch_metadata_payload(form, 2).images
            self.assertEqual([image.overlayStyle for image in images], ["card", "overlay"])
            self.assertEqual([image.showGpsCoordinates for image in images], [False, True])
            self.assertEqual([image.showColorStrip for image in images], [True, False])
        for form in ({"address[0]": "A"}, {"payload": '{"images":[{"address":"A"}]}'}):
            self.assertEqual(parse_batch_metadata_payload(form, 1).images[0].overlayStyle, "original")

    def test_metadata_accepts_zero_coordinates_and_normalizes_ratio(self):
        payload = parse_single_metadata_payload({
            "payload": '{"latitude":"0","longitude":"0","photoName":"Equator","aspectRatio":"DEFAULT","clientImageId":"a"}'
        })
        self.assertEqual((payload.latitude, payload.longitude), ("0", "0"))
        self.assertEqual(payload.aspectRatio, "Default")

    def test_metadata_rejects_malformed_roots_and_missing_location(self):
        for raw in ("[]", "null", "{"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_single_metadata_payload({"payload": raw})
        with self.assertRaisesRegex(ValueError, "address or a complete"):
            parse_single_metadata_payload({"payload": '{"photoName":"No location"}'})

    def test_batch_requires_matching_count_and_unique_ids(self):
        form = {"payload": '{"images":[{"address":"A","clientImageId":"same"},{"address":"B","clientImageId":"same"}]}' }
        with self.assertRaisesRegex(ValueError, "unique"):
            parse_batch_metadata_payload(form, 2)
        with self.assertRaisesRegex(ValueError, "count"):
            parse_batch_metadata_payload({"payload": '{"images":[{"address":"A"}]}'}, 2)

    def test_border_values_and_correlation_are_validated(self):
        with self.assertRaisesRegex(ValueError, "whole number"):
            parse_border_payload({"payload": '{"borderSize":null,"aspectRatio":"4:5"}'}, 1)
        with self.assertRaisesRegex(ValueError, "whole number"):
            parse_border_payload({"payload": '{"borderSize":-1,"aspectRatio":"4:5"}'}, 1)
        with self.assertRaisesRegex(ValueError, "whole number"):
            parse_border_payload({"payload": '{"borderSize":10.5,"aspectRatio":"4:5"}'}, 1)
        with self.assertRaisesRegex(ValueError, "positive W:H"):
            parse_border_payload({"payload": '{"borderSize":10,"aspectRatio":"0:5"}'}, 1)
        with self.assertRaisesRegex(ValueError, "Aspect ratio must be text"):
            parse_border_payload({"payload": '{"borderSize":10,"aspectRatio":[]}'}, 1)
        with self.assertRaisesRegex(ValueError, "count"):
            parse_border_payload({"payload": '{"borderSize":10,"aspectRatio":"4:5","clientImageIds":["a"]}'}, 2)


if __name__ == "__main__":
    unittest.main()
