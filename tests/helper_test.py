import unittest
from processing_scripts.helpers import *

class TestHelpers(unittest.TestCase):

    def test_get_coordinates_from_address(self):
        # Test with a valid address
        address = "1707 Calderdale Ct, Hanover, MD 21076"
        coordinates = get_coordinates_from_address(address)
        self.assertIsInstance(coordinates, tuple)
        self.assertEqual(len(coordinates), 2)
        self.assertTrue(all(isinstance(coord, float) for coord in coordinates))

        # Test with an invalid address
        invalid_address = "This is not a valid address"
        get_coordinates_from_address(invalid_address)
        if coordinates == (None, None):
            self.assertTrue(True)
