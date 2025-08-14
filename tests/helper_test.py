import unittest
from processing_scripts.helpers import *

class TestHelpers(unittest.TestCase):

    def test_get_coordinates_from_address(self):
        # Test with a valid address
        address = "112 North Main St, Windsor, NJ"
        coordinates = get_coordinates_from_address(address)
        self.assertIsInstance(coordinates, tuple)
        self.assertEqual(len(coordinates), 2)
        self.assertTrue(all(isinstance(coord, float) for coord in coordinates))

        # Test with an invalid address
        invalid_address = "This is not a valid address"
        get_coordinates_from_address(invalid_address)
        if coordinates == (None, None):
            self.assertTrue(True)

    def test_calculate_padding_for_aspect_ratio(self):
        # Test with a valid aspect ratio
        aspect_ratio = (3, 4)
        test_image_path = "C:/Users/rahul/OneDrive/Pictures/May 2025/JPGs/DSCF4351.JPG"
        img = Image.open(test_image_path)
        img = ImageOps.exif_transpose(img)
        border_percentage = 50

        img_with_border = create_simple_border(img, aspect_ratio, border_percentage)
        img_with_border.show()
        print(f"Image with border size: {img_with_border.size}")
