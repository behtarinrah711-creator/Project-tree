# Contract form regression

The real contract form stopped rendering after its UI helper functions were removed from the legacy runtime during modular migration while the modular form still referenced them. The fix moves the form UI behavior fully into the real-contract module and adds browser regression coverage.
