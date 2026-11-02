# BTW Singapore Form Assistant

A private tool to prepare Singapore Form 14A for tourism, family/friend visits and the existing business form-filling path. It reads passport pages and a hotel booking, lets staff edit all answers, checks for missing information, and downloads the original four-page form with entered details.

## Using the tool

1. Upload the passport first page and address page, then select **Read passport details**.
2. Upload a hotel booking and select **Read hotel details**.
3. Review each section. Enter missing answers from the applicant. Enter the arrival date manually in Occupation & travel.
4. Confirm the residential address and that the hotel booking covers the applicant. Record every antecedent answer explicitly.
5. Select **Check & download form**, or download a draft to continue later outside the tool. The applicant must review, sign, and affix a photograph separately.

## What is stored

This version does not save applicant records, documents, or answers to a server or browser storage. Closing or refreshing the page clears the entered information. Document reading uses browser-based OCR or a PDF's embedded text. All document-processing libraries are served with the application; no third-party OCR endpoint is used.

For the private company website, access is enforced by the Node.js company-login server. Hostinger setup is documented in [HOSTINGER.md](HOSTINGER.md). The static Windows launcher is a separate local edition without account enforcement.

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

Run `npm run check`, `npm test`, `npm run test:passport` and `npm run test:auth` for verification. See [HOSTINGER.md](HOSTINGER.md) for external deployment.

## Address assistance and capital letters

Issue country is identified from the passport issuing-state code (IND becomes INDIA); the issue city is not used for this field. Typed and extracted text is capitalised in the website and PDF. Reference-only hotel address, stay dates and lead guest fields are omitted. Downloaded PDFs have no added watermark, including drafts.

District suggestions use explicit address district labels or a bundled India Post PIN directory; ambiguous or unknown addresses remain for manual completion. All lookup happens locally in the browser. Review suggestions because administrative boundaries can change.

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

The target company website uses separate work-email/password accounts. Serve the app through `server/server.mjs`, including its protected PDF and OCR assets. Do not publish `dist/` directly for the staff-login edition. No applicant documents or records are stored by the app.

## Default hotel when no booking is uploaded

The owner-configured fallback is HOTEL BOSS, CONTACT@HOTELBOSS.SG, 500 JALAN SULTAN, SINGAPORE 199020. It fills hotel name, building, block/house number, street and postal code, plus local hotel name/email/relationship when those fields are blank. No phone number, floor, unit or reservation details are invented.

The fallback is labelled as default accommodation, not an uploaded booking. It applies to tourism/business hotel stays and to family/friend cases only when Hotel is explicitly selected. Residential host stays are preserved. Selecting a hotel file clears the tracked automatic fallback values before reading it, so failed/missing extraction does not silently reuse Hotel Boss. Manual values are not repeatedly overwritten. Starting a new applicant restores the fallback where applicable.


## Separate company login edition

A work-email/password server is now available for external hosting. See [COMPANY-LOGIN.md](COMPANY-LOGIN.md) for first-admin setup, staff management, security controls and hosting requirements. Use `Start-Company-Login.cmd` for this edition. The original static launcher is still a computer-local edition without account enforcement. The existing ChatGPT-hosted Site has separate platform sign-in; this addition does not replace that gate or deploy a new external website.


## Passport OCR reliability update (2026-11-02)

Passport extraction now reads English visual labels without requiring an exact Indian MRZ. Dates follow their labels rather than document text order. Invalid calendar dates and contradictory issue/expiry dates are left blank for review. Complete TD3 machine-readable lines can supply checked passport numbers, birth dates and expiry dates; numerical OCR corrections must pass the field check digit. Names are never inferred from an incomplete MRZ alone.

Passport images retain up to 3200 pixels on the longest edge, with bounded upscaling for small images. Recognition uses automatic page segmentation, then enhanced contrast and a machine-readable-line pass only when key fields are missing. PDF pages with a text layer but incomplete passport details also receive an OCR attempt. Missing critical fields are listed explicitly. Different current passport numbers across uploaded pages block extraction. Hotel and invitation reading remain separate. Applicant processing stays in the browser.

Run `npm run test:passport`, `npm test`, and `npm run test:auth`. Regression fixtures use synthetic text only. A synthetic image was also processed through the actual bundled English Tesseract language data and all six critical visual fields matched. This does not establish accuracy on unseen customer scans, nor ten simultaneous-user capacity. Cropped, blurry, glare-obscured, sideways or unreadable source images may still need a clearer upload or manual completion. No external OCR service or paid API was added.

For the AWS Docker edition, pulling GitHub changes on a Windows computer does not deploy them to the running server. Transfer updated source, rebuild the image, and recreate the running app container with its existing origin, network and persistent authentication volume. Back up authentication data before deployment. Do not rerun administrator bootstrap or replace the existing data volume during this update.


## Hostinger hosting

The deployment target is now Hostinger. The interface remains HTML/CSS/JavaScript. See [HOSTINGER.md](HOSTINGER.md) and `deploy/hostinger/compose.yaml` for the complete VPS deployment with HTTPS and persistent staff accounts. The JavaScript login server is retained. AWS infrastructure is not automatically migrated, stopped, or deleted by this change.


## Repository-root index

`index.html` is available at the top level, alongside `package.json`. It loads the existing files under `dist/` through its relative base URL. Keep this entry synchronized with `dist/index.html` when changing the HTML. The internal `dist/index.html` remains for the existing Windows launchers and protected Node server. The root entry is a static entry point; company-login hosting must still use the Node server described in HOSTINGER.md.
