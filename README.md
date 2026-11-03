# BTW Singapore Form Assistant

A private tool to prepare Singapore Form 14A for tourism, family/friend visits and the existing business form-filling path. It reads passport pages and a hotel booking, lets staff edit all answers, checks for missing information, and downloads the original four-page form with entered details.

## Using the tool

1. Upload the passport first page and address page, then select **Read passport details**.
2. Upload a hotel booking and select **Read hotel details**.
3. Review each section. Enter missing answers from the applicant. Enter the arrival date manually in Occupation & travel.
4. Confirm the residential address and that the hotel booking covers the applicant. Record every antecedent answer explicitly.
5. Select **Check & download form**, or download a draft to continue later outside the tool. The applicant must review, sign, and affix a photograph separately.

## What is stored

This version does not save applicant records, documents, or answers to server or browser storage. Closing or refreshing the page clears the entered information. The default reader uses browser OCR or embedded PDF text. An optional PaddleOCR backend reads passport files on the website server; hotel and invitation reading stays in the browser. The page shows the selected mode and its processing notice. No paid third-party OCR API is used. See [hosted PaddleOCR setup](PADDLE-OCR.md) for backend hosting requirements and current validation limits.

Private access is managed by Sites. Keep the site private. Staff sharing is configured separately; application code does not replace the platform access controls.

## Scope and limits

- One applicant at a time. Tourism/business use the existing passport and hotel process; family/friend visits add either V39A or an invitation letter.
- PDF, JPG and PNG; 20 MB per file; up to 6 pages per document and 4 passport files.
- Extraction is a suggested transcription and must be checked against the source. The initial hotel format tested was the supplied Goibibo booking.
- Hotel contact details never replace the applicant's identity or contact details.
- A source document's pending-payment wording triggers a review notice. This is not a live booking check.
- Companion fields depend on age at the entered application date and the airline representative answer.
- Up to four foreign residence entries fit the form. Overflow is reported rather than truncated.
- Form output uses Latin characters and preserves the blank original template. Sensitive answers are never guessed.
- No government portal submission, booking verification, signature generation, or applicant database is included.

## Source files

- `dist/app.js`: document reading and the user workflow.
- `dist/schema.js`: fields, conditional questions and completion checks.
- `dist/parser.js`: passport extraction.
- `dist/hotel-parser.js`: hotel extraction.
- `dist/pdf.js`: placement of answers in the original form.
- `dist/form-14a.pdf`: source template.
- `tests/workflow.test.mjs`: extraction, child conditions, conditional requirements and overflow checks.

Run `npm run check` and `npm test` for verification. The tracked hosting manifest identifies the existing private site; reuse its project ID when editing or deploying.

## Address assistance and capital letters

Issue country is identified from the passport issuing-state code (IND becomes INDIA); the issue city is not used for this field. Typed and extracted text is capitalised in the website and PDF. Reference-only hotel address, stay dates and lead guest fields are omitted. Downloaded PDFs have no added watermark, including drafts.

District suggestions use explicit address district labels or a bundled India Post PIN directory; ambiguous or unknown addresses remain for manual completion. The browser reader and optional website backend use bundled data without an external address-lookup API. Review suggestions because administrative boundaries can change.

Country names: i18n-iso-countries / ISO 3166-1. Postal data: India Post, All India Pincode Directory, https://www.data.gov.in/catalog/all-india-pincode-directory-through-webservice . Bundled PIN/district/state index generated from the unchanged CSV mirror at https://github.com/dropdevrahul/pincodes-india/blob/master/pincode.csv (mirror snapshot 2024-05-05), under Government Open Data License – India. No user data is sent to this source.

## BTW branding

Website branding follows https://btwvisas.com/ : the company globe BTW logo, lime green `#a5d549`, secondary green `#8bc34a`, white and charcoal `#333`, and Lato typography. The original logo, favicon and font are bundled under `dist/brand/` rather than fetched from the company website during document processing. `dist/brand.css` contains the visual theme. Source assets were retrieved from the website's declared CloudFront asset URLs on 2026-11-01. This is a website theme change only.

## Family and friend visits

Select Family Visit or Friend Visit, upload the passport plus a V39A or invitation letter, and choose Read host details. Host name, phone, email and a supported relationship are suggested for review. Native filled V39A widgets are read in addition to ordinary PDF text; image documents use local OCR. Document content never replaces the passport applicant identity.

If a Singapore host address is found, Use host address for stay explicitly copies it into the stay fields and selects relative/friend accommodation. A missing address stays blank for manual completion. The host address is not assumed to be the stay address merely because it appears on V39A. The relationship on V39A describes the applicant relative to the host; supported relationships are reversed to describe the host relative to the applicant, without inferring gender from names. Confirm or edit the suggestion.

A family/friend completed download requires a read document and an explicit confirmation that it covers the current applicant. If document passport numbers do not include the current applicant, a review notice is shown. Changing applicant identity clears that confirmation. Changing visit type clears the Singapore stay and contact fields after a confirmation when populated.

Relatives, friends and next-of-kin accommodation choices map to the corresponding Form 14A ticks. Hotel-only inputs are hidden for residential stays. Business adds no invitation upload requirement and defaults the form purpose to Business; no additional business document automation has been introduced. Applicant signatures are not extracted or generated.

The initial V39A and invitation-letter formats were tested against the supplied samples. The supplied invitation letter does not contain a complete host address, so that case requires manual address entry.

## Current access mode

The owner explicitly enabled public access for team use without login. Anyone with the URL may use the app. Preserve the current public audience when deploying updates unless the owner requests otherwise. No applicant documents or records are stored by the app.

## Default hotel when no booking is uploaded

The owner-configured fallback is HOTEL BOSS, CONTACT@HOTELBOSS.SG, 500 JALAN SULTAN, SINGAPORE 199020. It fills hotel name, building, block/house number, street and postal code, plus local hotel name/email/relationship when those fields are blank. No phone number, floor, unit or reservation details are invented.

The fallback is labelled as default accommodation, not an uploaded booking. It applies to tourism/business hotel stays and to family/friend cases only when Hotel is explicitly selected. Residential host stays are preserved. Selecting a hotel file clears the tracked automatic fallback values before reading it, so failed/missing extraction does not silently reuse Hotel Boss. Manual values are not repeatedly overwritten. Starting a new applicant restores the fallback where applicable.


## Separate company login edition

A work-email/password server is now available for external hosting. See [COMPANY-LOGIN.md](COMPANY-LOGIN.md) for first-admin setup, staff management, security controls and hosting requirements. Use `Start-Company-Login.cmd` for this edition. The original static launcher is still a computer-local edition without account enforcement. The existing ChatGPT-hosted Site has separate platform sign-in; this addition does not replace that gate or deploy a new external website.


## Restored passport OCR fixes

The current passport reader supports English visual labels, validated TD3 machine-readable data, labelled dates, enhanced-contrast retries and clearer missing-field messages. It does not assign dates by their order in OCR text. See [OCR-UPDATE.md](OCR-UPDATE.md) to update the existing static Hostinger site. Run `npm run test:passport` for extraction regression tests.


## Low-resolution passport OCR update

Small images now receive up to four-times bounded scaling. Machine-readable country codes tolerate positional letter/digit OCR confusion; Indian document-number digit repairs require valid number, birth-date and expiry-date checks. Conflicting valid identities are rejected, and conflicting OCR name readings are left blank unless independently corroborated by printed text. Names are not subjected to global digit substitutions. A supplied 405-by-310-pixel passport image was tested locally: seven document fields were recovered correctly, while names and the issue date remained blank for manual review. Real customer text and images are not included in source or regression fixtures.
