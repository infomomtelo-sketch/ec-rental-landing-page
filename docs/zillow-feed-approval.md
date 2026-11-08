# Zillow feed approval: readiness packet

**Status (2026-11-08): not approved, not submitted.** Nothing is sent to Zillow. EC Rental publishes an XML file at
`https://ecrentalpm.com/feeds/zillow.xml`. Listings appear on Zillow only after Zillow's Rentals Integrations team approves
that feed and starts fetching it. The dashboard now says "Feed ready", not "On Zillow feed", for this reason.

## What Zillow's process looks like

From Zillow's published pages, as found by search. I could not open Zillow's own pages from the build environment, so
**confirm every item below with Zillow** before relying on it.

- Property management companies and software vendors request access through an intake form on Zillow Group's
  "Rentals Feed Integrations" developer page. Zillow's Rentals Integrations team must approve the request **before** feed work starts.
- Testing typically takes **4-6 weeks** and uses production data. There is no cost.
- The feed must follow Zillow's *Rental Listings Feed Guide*. Zillow also accepts MITS format.
- A HotPads help article says to email the finished feed and specs to `rentalfeeds@zillow.com`.
- A third-party summary says individual landlords are not eligible, only management companies and PMS vendors.
  EC Rental should apply as **a property management software vendor and management company**, with its Fresno LLC as the applicant.

## What is ready (done in this repo)

| Item | Where |
|---|---|
| Feed in hotPadsItems v2.1, single-unit listings, `ECR<id>` listing ids, https photo links | `src/listings.ts` `buildZillowFeed` |
| Only complete listings go out: active, switched on, 1+ photo, 50+ char description, date available, 5-digit ZIP, valid phone and email | `zillowIssues` |
| Duplicate addresses are held back (Zillow rejects them) | `withoutDuplicateAddresses` |
| Company block with name, email, phone, website | `ZILLOW_COMPANY` |
| Every fetch of the feed is logged (time, fetcher, IP, listings sent, size) | table `zillow_feed_fetches` |
| Admin **Zillow** tab: feed URL, fetch history, per-listing status and what is missing | `/admin` |
| Renter lead delivery endpoint (Zillow POSTs leads to us) | `POST /api/zillow/leads?key=...` |
| Offline checker for the feed | `scripts/check-zillow-feed.py` |
| Sample feed to attach to the application | `docs/sample-zillow-feed.xml` |
| Honest wording on the dashboard, admin page and feature page | UI copy |

Regenerate the sample and re-check it any time:

```
node --no-warnings scripts/sample-zillow-feed.mjs
python3 scripts/check-zillow-feed.py docs/sample-zillow-feed.xml
python3 scripts/check-zillow-feed.py https://ecrentalpm.com/feeds/zillow.xml --photos   # the live feed
```

The checker is ours. It is **not** Zillow's schema validation, so a pass does not guarantee acceptance. The sample's photo URLs are placeholders.

## Open items that need a person

1. **Deploy, then create the log table once:** `npm run db:init` (safe to repeat). Until then the feed works but nothing is logged.
2. **Business street address and ZIP.** Add them to `ZILLOW_COMPANY` in `src/listings.ts`. The intake form asks for the address and I did not guess it.
3. **Set the lead key:** `npx wrangler secret put ZILLOW_LEAD_KEY`, then give Zillow
   `https://ecrentalpm.com/api/zillow/leads?key=<that key>`. Without it the endpoint returns 503 and Zillow leads are lost.
4. **Submit the intake form** and attach: feed URL, sample feed, lead URL, company details, a support contact (`info@ecrentalpm.com`, (559) 825-3038),
   and the number of landlords and listings expected.
5. **Get Zillow's current Rental Listings Feed Guide** from the form response and check the sample against it. Things to verify
   against the guide, because I could not: element order and required fields, `dateAvailable` format, minimum photo size and count,
   whether `street hide="false"` is allowed for managers, `lastUpdated` format, the `providerType` value, and whether the guide wants an
   `<address>` in `<Company>`.
6. **Photos.** Zillow rejects photos below its minimum size and ones with people, logos or phone numbers. The dashboard
   resizes uploads to 1600px on the long side, but we do not check content. Spot-check real listings before testing starts.
7. **Real test listings.** Zillow tests with production data. Pick listings that are truly vacant and fully filled in.
8. **Confirm owner authority.** Zillow expects the advertiser to be allowed to rent each home. Our listing terms say this; decide
   how you want to verify owners before listings go to a third party.

## After Zillow approves

- Record the approval date and Zillow's contact in this file.
- Zillow, not us, issues the public listing URL for each home. Ask Zillow how it reports feed results (errors per listing,
  acceptance time); we receive none of this today. If Zillow supplies a report or API, add columns for it to the admin tab.
- Until then, the only evidence of Zillow activity is the **Recent feed fetches** table, and a fetch by Zillow is not acceptance.

## Reply for Fernando Navarro (draft, not sent)

> Hi Fernando,
>
> Thank you for checking each listing. You're right to ask. I looked into it, and here is the honest answer.
>
> The "On Zillow feed" label only meant your listing was complete and included in EC Rental's feed file. It did not mean Zillow had
> received or accepted it. EC Rental's connection to Zillow has not been approved by Zillow yet, so none of your four listings
> are live on Zillow, and waiting will not change that. The Zillow pages you found are old pages Zillow already had for those addresses.
> We have no Zillow listing URLs, acceptance times or rejection reports for your homes, because nothing has been sent.
>
> We have changed the label so it no longer says that, and we are preparing the application for Zillow's approval. Zillow says
> testing typically takes 4-6 weeks after approval to start, and I can't promise a date. Until then, please advertise on Zillow
> Rental Manager directly, or use the Share button for Facebook and Marketplace. Your listings are live on your EC Rental page and
> inquiries there reach you.
>
> I'm sorry for the confusion.
