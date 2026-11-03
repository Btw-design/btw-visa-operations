import hashlib
import io
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image
from app import create_app, lines_from_prediction, normalize_image, PaddleReader

TOKEN = "test-service-token-for-unit-tests-only-123456789"
HEADERS = {"Authorization": "Bearer " + TOKEN, "Content-Type": "image/png"}


def png():
    data = io.BytesIO()
    Image.new("RGB", (40, 30), "white").save(data, format="PNG")
    return data.getvalue()


class FakeReader:
    def __init__(self):
        self.active = 0
        self.maximum = 0
        self.calls = 0

    def read(self, data):
        self.active += 1
        self.maximum = max(self.maximum, self.active)
        self.calls += 1
        time.sleep(.01)
        self.active -= 1
        return [{"visual_texts": ["Surname\nSAMPLE"], "mrz_texts": []}]


class ServiceTests(unittest.TestCase):
    def test_service_authentication_and_request_hash(self):
        reader = FakeReader()
        with TestClient(create_app(reader, TOKEN)) as client:
            self.assertEqual(client.get("/healthz").status_code, 401)
            self.assertEqual(client.post("/ocr", content=png(), headers={"Content-Type": "image/png"}).status_code, 401)
            self.assertEqual(reader.calls, 0)
            response = client.post("/ocr", content=png(), headers=HEADERS)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["input_sha256"], hashlib.sha256(png()).hexdigest())
            self.assertEqual(response.json()["engine"], "paddleocr")
            self.assertEqual(client.get("/healthz", headers=HEADERS).json()["ready"], True)

    def test_invalid_input_limits(self):
        reader = FakeReader()
        with TestClient(create_app(reader, TOKEN)) as client:
            self.assertEqual(client.post("/ocr", content=b"", headers=HEADERS).status_code, 400)
            self.assertEqual(client.post("/ocr", content=png(), headers={**HEADERS, "Content-Type": "text/plain"}).status_code, 415)
            self.assertEqual(client.post("/ocr", content=b"x" * (20 * 1024 * 1024 + 1), headers=HEADERS).status_code, 413)
            self.assertEqual(reader.calls, 0)

    def test_inference_errors_do_not_expose_documents(self):
        class FailingReader:
            def read(self, data):
                raise RuntimeError("private applicant output must never be returned")
        with TestClient(create_app(FailingReader(), TOKEN)) as client:
            response = client.post("/ocr", content=png(), headers=HEADERS)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("private applicant", response.text)

    def test_concurrent_clients_do_not_share_an_active_predictor_call(self):
        reader = FakeReader()
        with TestClient(create_app(reader, TOKEN)) as client:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: client.post("/ocr", content=png(), headers=HEADERS), range(2)))
            self.assertTrue(all(result.status_code == 200 for result in results))
            self.assertEqual(reader.calls, 2)
            self.assertEqual(reader.maximum, 1)

    def test_two_column_rows_keep_labels_and_dates_in_the_same_order(self):
        prediction = {"rec_texts": ["Date of Expiry", "Date of Issue", "27/10/2036", "28/10/2026"], "rec_scores": [.99] * 4, "rec_boxes": np.array([[400, 10, 600, 30], [10, 10, 200, 30], [400, 40, 600, 60], [10, 40, 200, 60]])}
        self.assertEqual(lines_from_prediction(prediction), "Date of Issue     Date of Expiry\n28/10/2026     27/10/2036")

    def test_normalization_is_deterministic_and_handles_transparency(self):
        image = Image.new("RGBA", (40, 30), (0, 0, 0, 0))
        first, second = normalize_image(image), normalize_image(image)
        self.assertEqual(first.mode, "RGB")
        self.assertEqual(first.size, (160, 120))
        self.assertEqual(first.tobytes(), second.tobytes())
        self.assertEqual(first.getpixel((0, 0)), (255, 255, 255))

    def test_pdf_pages_are_rendered_on_the_server_and_closed(self):
        # Exercise PDF decoding/rendering without pretending to run a model.
        reader = object.__new__(PaddleReader)
        reader.page = lambda image, embedded="": {"size": image.size, "visual_texts": [embedded], "mrz_texts": []}
        data = io.BytesIO()
        Image.new("RGB", (80, 60), "white").save(data, format="PDF", save_all=True, append_images=[Image.new("RGB", (80, 60), "white")])
        pages = reader.read(data.getvalue())
        self.assertEqual(len(pages), 2)
        self.assertTrue(all(page["size"][0] > 0 for page in pages))
        with self.assertRaisesRegex(ValueError, "valid JPG or PNG"):
            reader.read(b"not an image")


if __name__ == "__main__":
    unittest.main()
