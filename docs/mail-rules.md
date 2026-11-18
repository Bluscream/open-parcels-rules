# Mail rules

One YAML file per rule in `data/mail/`, named after its `id` (`<kind>-<sender>`). A mail can
match several rules (an Amazon shipping mail yields a `parcel` and an `order` result); results
come in rule-id order.

```yaml
id: parcel-dhl
name: DHL parcel notifications
kind: parcel                      # parcel | order | return | dunning
senders:
  addresses: [donotreply_odd@dhl.com]   # exact addresses
  domains: [dhl.de]                     # domain suffixes
  local_parts: [noreply]                # optional: domain matches need one of these
subject: ['...']                  # optional: one must match the subject
exclude: ['...']                  # optional: none may match the subject
body: ['\bDPD\b']                 # optional: one must match the text (relays such as Allegro)
flags: [i]                        # default flags for bare-string patterns (default: [i])
carrier: dhl                      # default carrier
carrier_from: carrier             # read the carrier from the `carrier` field first
extractors: [detect_tracking_numbers]
extract:
  tracking_number: [{ pattern: '...(?<tracking_number>...)...', in: [subject, text] }]
  order_number:    [{ pattern: '...(?<order_number>...)...' }]
  tracking_url:    [{ pattern: '(?<tracking_url>https://...)', in: [text, html] }]
  pickup_code:     [{ pattern: '...(?<pickup_code>\d{6})' }]
  item:            [{ pattern: '^\s*[•*]\s*(?<item>[^\n]+)$', flags: [i, m] }]
  arrival:         [{ pattern: '(?<arrival>(?:zustellung|arriving)[^\n]{0,80})' }]
  carrier:         [{ pattern: 'versand mit (?<carrier>DHL|Hermes)' }]
status_keywords:                  # first group with a matching pattern wins
  - { status: delivered, patterns: ['wurde zugestellt'] }
event_keywords:                   # order, return and dunning events
  - { event: order_shipped, patterns: ['^versandt'], in: [subject] }
default_status: in_transit
require: [tracking_number]        # no result without these fields
tests:
  - fixture: dhl-de-today.eml     # under test/fixtures/mail/
    time_zone: Europe/Berlin
    expect:                       # subset match against parseMail's results, in order
      - { ruleId: parcel-dhl, status: out_for_delivery, trackingNumbers: ["340011223348"] }
```

- `in` takes `subject`, `text` and `html` (the HTML part converted to text, with link targets
  kept as `<url>`). The default is `[subject, text]`; `text` is the HTML as text when a mail
  has no plain part.
- Each extraction pattern must contain a group named after its field; every match is
  collected, deduplicated, in order. Tracking numbers lose their spaces and are upper-cased,
  and a number that also appears as an order number is dropped.
- `arrival` texts are parsed with all locales against the mail's `Date`; a timed window wins
  over a whole day. Without a mail date there is no arrival.
- Events: `order_placed`, `order_confirmed`, `order_shipped`, `order_cancelled`,
  `return_started`, `return_received`, `refund_issued`, `return_rejected`,
  `payment_reminder`, `payment_warning`, `debt_collection`.

## Named extractors

For the few things a regex cannot express, a rule may name code in
[`src/mail/extractors.ts`](../src/mail/extractors.ts). There is one:

- **`detect_tracking_numbers`**: runs the checksum-aware tracking-number detector over the
  subject and text, with the sender domain and the rule's carrier (or the one named in the
  mail) as hints, and adds every number with a confidence of at least 0.5. When all of them
  belong to one carrier and the mail names none, that carrier is used. Shops and marketplaces
  whose carrier varies (eBay, OTTO, Zalando, JLCPCB, BerryBase) and carriers with several
  number formats use it instead of a loose digit regex.

Add another only when data cannot do the job, and document it here.

## Beyond the rules

- **schema.org**: `ParcelDelivery` in JSON-LD (`<script type="application/ld+json">`) or
  microdata gives an extra result with `ruleId: "schema.org"`. Mails without the word
  `ParcelDelivery` cost nothing.
- **Fallback**: when no rule and no markup applies, a mail from a known carrier domain, or one
  that mentions a tracking keyword from the locale tables ("Sendungsnummer", "tracking
  number"), is scanned for tracking numbers; numbers with a confidence of at least 0.6 give a
  result with `ruleId: "fallback"`.

## Fixtures

Fixtures are hand-written `.eml` files with made-up content: `example.com` recipients,
placeholder names, and tracking numbers whose check digits are computed, not copied. They are
stored byte for byte (`.gitattributes` marks them binary). The test helper reads headers with
encoded words, multipart bodies, quoted-printable and base64.
