"""Private PaddleOCR worker. Expose it only to the website backend."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import hmac
import io
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
import numpy as np

MAX_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 32_000_000
MAX_PAGES = 6
PIPELINE = "paddleocr-3.3.2-ppocrv5-mobile-cpu-r1"


def lines_from_prediction(prediction: Any) -> str:
    """Restore reading rows so side-by-side date labels retain their columns."""
    texts = prediction.get("rec_texts", [])
    scores = prediction.get("rec_scores", [])
    boxes = prediction.get("rec_boxes")
    if boxes is None:
        polygons = prediction.get("rec_polys")
        if polygons is None:
            polygons = prediction.get("dt_polys", [])
        boxes = [np.array([np.min(p, axis=0), np.max(p, axis=0)]).reshape(4) for p in polygons]
    items = []
    for text, score, box in zip(texts, scores, boxes):
        if float(score) < 0.35 or not str(text).strip():
            continue
        x1, y1, x2, y2 = map(float, box)
        items.append((x1, (y1 + y2) / 2, max(1, y2 - y1), str(text).strip()))
    rows = []
    for item in sorted(items, key=lambda p: (p[1], p[0])):
        row = next((r for r in reversed(rows) if abs(r[0][1] - item[1]) <= min(r[0][2], item[2]) * .45), None)
        if row is None:
            rows.append([item])
        else:
            row.append(item)
    return "\n".join("     ".join(p[3] for p in sorted(row, key=lambda p: p[0])) for row in rows)[:50000]


def normalize_image(image: Image.Image) -> Image.Image:
    if image.width * image.height > MAX_PIXELS:
        raise ValueError("Image is too large. Use a scan of at most 32 megapixels.")
    image = ImageOps.exif_transpose(image)
    rgba = image.convert("RGBA")
    white = Image.new("RGBA", rgba.size, "white")
    white.alpha_composite(rgba)
    result = white.convert("RGB")
    longest = max(result.size)
    scale = min(4, 1800 / longest) if longest < 1800 else min(1, 3000 / longest)
    if scale != 1:
        result = result.resize((max(1, round(result.width * scale)), max(1, round(result.height * scale))), Image.Resampling.LANCZOS)
    return result


class PaddleReader:
    def __init__(self):
        # Loading models downloads only public model weights, never applicant files.
        from paddleocr import PaddleOCR
        options = dict(
            device="cpu", enable_mkldnn=False, cpu_threads=2,
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="en_PP-OCRv5_mobile_rec",
            doc_orientation_classify_model_name="PP-LCNet_x1_0_doc_ori",
            use_doc_orientation_classify=True, use_doc_unwarping=False,
            use_textline_orientation=False, text_det_limit_side_len=2400,
            text_det_limit_type="max", text_rec_score_thresh=.35,
        )
        for variable, key in [("PADDLE_DET_MODEL_DIR", "text_detection_model_dir"), ("PADDLE_REC_MODEL_DIR", "text_recognition_model_dir"), ("PADDLE_ORIENTATION_MODEL_DIR", "doc_orientation_classify_model_dir")]:
            if os.getenv(variable):
                options[key] = os.environ[variable]
        self.engine = PaddleOCR(**options)

    def predict_text(self, image: Image.Image) -> str:
        # Paddle's ndarray input uses BGR, not browser canvas pixels.
        pixels = np.ascontiguousarray(np.asarray(image)[:, :, ::-1])
        return "\n".join(lines_from_prediction(result) for result in self.engine.predict(pixels))[:50000]

    def page(self, image: Image.Image, embedded_text: str = "") -> dict:
        image = normalize_image(image)
        w, h = image.size
        visual = [embedded_text.strip(), self.predict_text(image)]
        ratio = w / h
        if 1.1 <= ratio <= 1.8 or .55 <= ratio <= 1:
            visual.append(self.predict_text(image.crop((int(w * .30), 0, w, int(h * (.44 if ratio <= 1 else .75))))))
        bands = [(0, int(h * .65), w, h)]
        if .55 <= ratio <= 1:
            bands.append((0, int(h * .35), w, int(h * .55)))
        mrz = [self.predict_text(image.crop(box)) for box in bands]
        return {"visual_texts": list(dict.fromkeys(t for t in visual if t)), "mrz_texts": mrz}

    def read(self, data: bytes) -> list[dict]:
        if data.startswith(b"%PDF-"):
            import pypdfium2 as pdfium
            try:
                pdf = pdfium.PdfDocument(data)
            except Exception as exc:
                raise ValueError("Could not open PDF. Use an unlocked PDF, JPG or PNG.") from exc
            try:
                if len(pdf) > MAX_PAGES:
                    raise ValueError("Use no more than 6 pages per document.")
                pages = []
                for index in range(len(pdf)):
                    page = pdf[index]
                    try:
                        textpage = page.get_textpage()
                        try:
                            embedded = textpage.get_text_range()[:50000]
                        finally:
                            textpage.close()
                        width, height = page.get_size()
                        bitmap = page.render(scale=min(3, 2400 / max(width, height)))
                        try:
                            pages.append(self.page(bitmap.to_pil().copy(), embedded))
                        finally:
                            bitmap.close()
                    finally:
                        page.close()
                return pages
            finally:
                pdf.close()
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in {"JPEG", "PNG"}:
                    raise ValueError("Use PDF, JPG or PNG files.")
                return [self.page(image)]
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
            raise ValueError("Could not decode image. Use a valid JPG or PNG.") from exc


def create_app(reader=None, token=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.token = token or os.getenv("OCR_SERVICE_TOKEN", "")
        if len(app.state.token) < 32 or not app.state.token.isascii():
            raise RuntimeError("Set OCR_SERVICE_TOKEN to a random value of at least 32 characters.")
        app.state.reader = reader if reader is not None else await run_in_threadpool(PaddleReader)
        app.state.lock = asyncio.Lock()
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authorize(request):
        expected = "Bearer " + app.state.token
        if not hmac.compare_digest(request.headers.get("authorization", "").encode(), expected.encode()):
            raise HTTPException(401, "OCR service authentication required.")

    @app.get("/healthz")
    async def health(request: Request):
        authorize(request)
        return {"ready": True, "engine": "paddleocr", "pipeline_version": PIPELINE}

    @app.post("/ocr")
    async def ocr(request: Request):
        authorize(request)
        content_type = request.headers.get("content-type", "").split(";")[0]
        if content_type not in {"image/jpeg", "image/png", "application/pdf"}:
            raise HTTPException(415, "Use PDF, JPG or PNG files.")
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > MAX_BYTES:
                raise HTTPException(413, "Each file must be 20 MB or smaller.")
        if not data:
            raise HTTPException(400, "Empty document.")
        try:
            await asyncio.wait_for(app.state.lock.acquire(), timeout=30)
        except TimeoutError:
            raise HTTPException(429, "OCR is busy. Try again shortly.")
        try:
            raw = bytes(data)
            pages = await run_in_threadpool(app.state.reader.read, raw)
            return {"engine": "paddleocr", "pipeline_version": PIPELINE, "input_sha256": hashlib.sha256(raw).hexdigest(), "pages": pages}
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception:
            # Do not expose/log OCR output or uploaded bytes on inference failure.
            raise HTTPException(503, "OCR processing failed. Try a clearer document or contact the administrator.")
        finally:
            app.state.lock.release()
            data.clear()

    return app


app = create_app()
