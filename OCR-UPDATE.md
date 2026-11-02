# Apply the OCR update to the current Hostinger site

The inspected live site serves its frontend files directly at the website root. On that site, update `app.js`, `parser.js` and the new `passport-ocr.js` in the same folder as the live `index.html`. Keep a backup of the old files first. These three files are under `dist/` in GitHub; the small update ZIP places them at its root for direct extraction into that live folder.

In Hostinger File Manager, open the folder containing the live `app.js` (normally `public_html`), upload the update ZIP and extract it there, allowing the three replacements. Avoid adding an extra enclosing directory. Clear the Hostinger/CDN cache if enabled and hard-refresh the browser with Ctrl+F5. Existing PDF/OCR language assets and the current index can stay in place. Verify that `/passport-ocr.js` now responds with JavaScript and read a known passport again.

The update reads visual labels without requiring an exact P<IND line. It associates dates with labels, validates MRZ field check digits, leaves contradictory dates empty, retains more image detail, and retries weak reads with enhanced contrast and an MRZ pass. Missing critical fields are listed for review. Processing stays in the browser, with no external OCR or OpenAI API.

Validation: 37 regression checks and a synthetic-image test through the actual English OCR engine. The original failing customer passport files have not been supplied, so their extraction accuracy remains unverified. Ten simultaneous-user capacity has not been established. This frontend update does not add staff authentication to a site that is served statically.
