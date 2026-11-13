import unittest

from services.request_payloads import parse_batch_metadata_payload, parse_border_payload, parse_single_metadata_payload


class RequestPayloadTests(unittest.TestCase):
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
