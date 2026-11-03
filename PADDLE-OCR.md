# PaddleOCR on the hosted website

Staff continue using a website. Original passport files go to the website backend, which sends them to one private PaddleOCR worker and validates the extracted fields against MRZ checks. Neither PC runs passport OCR or resizes the passport before upload in this mode. Hotel and invitation readers retain their existing browser processing.

Sign-in is left aside as requested: the supplied deployment preserves the current open-access website arrangement. It does not add staff accounts or a new login requirement. The Python worker itself requires an internal service token and has no published host port. Privately hosting this software does not by itself restrict who can open its website.

## Hosting requirement

PaddleOCR needs a Python backend. PHP/static-only hosting cannot run this setup by uploading the JavaScript files. Use a VPS or application host that can run Node.js 24 and Python 3.12, or deploy the supplied Docker Compose stack. Both services can run on the same host; the website remains the browser entry point. Confirm the current Hostinger plan before attempting to activate this on the existing URL. A separately hosted backend is possible, but its routing and HTTPS configuration must be provided by the host.

The Compose stack includes an HTTPS reverse proxy. A hostname whose DNS points to the server and ports 80/443 are needed for that option. If the platform already terminates HTTPS, use its reverse proxy instead of starting a second TLS proxy on the same ports.

## Deploy using containers

1. Download/pull the repository on the backend host. Install Docker with Compose and Node.js 24 for the environment setup command. Keep `dist/` and `server/` from the same release.
2. Run `node scripts/setup-paddle.mjs` and enter the website hostname without `https://`. This creates the ignored `paddle.env` file with a random service token; it does not print the token. The script refuses to overwrite an existing file.
3. Point that hostname at the host. Run `docker compose --env-file paddle.env -f compose.paddle.yml up -d --build`.
4. On first startup, PaddleOCR downloads its public model weights. The website container waits for the worker to be ready. Check startup with `docker compose --env-file paddle.env -f compose.paddle.yml logs --tail=50 paddle`. Model downloads need internet access; applicant documents are never sent to model download hosts.
5. Open the HTTPS website. Its header must say **PaddleOCR**. `GET /api/ocr/config` must return `mode: "paddle"`. Upload the same originals on both PCs and compare all fields against the passports before team rollout.

The persistent `paddle_models` volume stores model weights/cache, not uploaded applicant files. The app processes documents in memory and does not intentionally write uploads, OCR text or applicant form records to disk. Do not add request-body logging at the hosting proxy. Keep `paddle.env` out of GitHub and out of web-served folders.

If the header says **Browser reader**, PaddleOCR is not enabled on that website. When PaddleOCR is enabled but its service fails, reads show an error; they do not silently fall back to Tesseract. Copying `dist/` to static hosting does not activate a Python backend.

## Deploy using native processes

For a host supporting separate application processes:

1. Create a Python 3.12 virtual environment and install `ocr-service/requirements.lock` there. These are CPU packages; no GPU or paid OCR API is required.
2. Give the worker a writable model-cache directory through `PADDLE_PDX_CACHE_HOME`. Set `OCR_SERVICE_TOKEN` to the same randomly generated value in the worker and Node backend. Set `HF_HOME`, `PADDLE_HOME`, `MODELSCOPE_CACHE` and `XDG_CACHE_HOME` to writable cache locations when the host restricts user directories.
3. Run `uvicorn app:app --app-dir ocr-service --host 127.0.0.1 --port 8000 --workers 1 --no-access-log`. The virtual environment must be active. Keep one worker per model instance so inference is serialized and predictor state is not shared concurrently.
4. Set `PADDLE_OCR_URL=http://127.0.0.1:8000`, `OCR_SERVICE_TOKEN`, `NODE_ENV=production` and the platform's `PORT` for the website process. Run `node server/server.mjs`. Use the platform's HTTPS reverse proxy and preserve the original Host header. Keep the Python port private.
5. Configure process supervision and model-cache persistence on the host. Restarting a transient shell is not a permanent deployment. After code updates, run `npm run build:release` and restart both the Node backend and Python worker so the loaded parsers/models match the deployed files.

For a server without model-download access, provide local model directories through `PADDLE_DET_MODEL_DIR`, `PADDLE_REC_MODEL_DIR` and `PADDLE_ORIENTATION_MODEL_DIR`. They must contain the corresponding PaddleOCR model files. No model weights are included in this GitHub repository.

## Versions, limits and verification

The CPU pipeline pins PaddleOCR 3.3.2, PaddlePaddle 3.2.2, PaddleX 3.3.10, English PP-OCRv5 mobile recognition, PP-OCRv5 mobile detection and document orientation classification. Python dependencies are locked in `ocr-service/requirements.lock`. Public model weights are cached after installation. The API returns original input SHA-256 values and a pipeline version alongside canonical fields and a 14-key JSON extraction with DD-MM-YYYY dates.

Uploads support JPG, PNG and unlocked PDF, up to four files, 20 MB per file and six PDF pages per file. Oversized images are rejected above 32 megapixels. PDF rendering, image normalization, OCR and field reconciliation happen on the backend. A single worker serializes inference; busy/time-out errors are explicit. Actual capacity and latency must be measured on the selected host.

Run `npm ci` on the test machine, then the JavaScript checks with `npm run check`, `node tests/passport.test.mjs`, `node tests/ocr-server.test.mjs`, `node tests/release.test.mjs` and `node tests/workflow.test.mjs`. Run `python -m unittest discover -s ocr-service -p test_service.py -v` in the worker environment. The HTTP/inference contract tests use an explicit test reader; they are not accuracy tests for pretrained models.

The checked implementation passed 39 passport regressions, 8 gateway/client checks, 3 release checks, 13 workflow checks, 7 Python worker checks, and 10 existing optional account-server checks. The website-to-worker contract also filled the form in two browser pixel-density profiles without starting browser OCR. This verification used a named test reader, not pretrained Paddle inference. Sign-in was not activated.

In the development environment, the Python packages installed successfully, but the external model hosts were unavailable. Real PaddleOCR inference and accuracy on the supplied passports remain unverified until model weights are available. Repeated results from a shared backend improve control over consistency; they do not establish 100% extraction accuracy.

Official integration reference: [PaddleOCR pipeline usage](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html). The runtime here is deliberately pinned; do not replace it with a newer API/model without rerunning the passport regression set.
