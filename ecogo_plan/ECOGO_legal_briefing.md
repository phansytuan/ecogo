# ECOGO — Legal & Compliance Briefing for Counsel

**Purpose:** a structured question bank to take into a meeting with a licensed Vietnamese
transport + technology lawyer, so you arrive with the right questions instead of paying to
discover them. **This is not legal advice.** It is a founder's preparation document. Vietnamese
law in this area changed substantially in 2025–2026 and implementing circulars are still emerging,
so every item below must be confirmed against the current text with qualified counsel.

---

## 0. What changed — start from the current law, not the old decrees

Most online guidance (and a lot of institutional memory) still refers to **Nghị định 10/2020/NĐ-CP**.
For planning purposes, treat the baseline as the **2025–2026** instruments:

- **Luật Đường bộ 2024** (Road Law) and **Luật Trật tự, an toàn giao thông đường bộ 2024**, effective **01/01/2025**.
- **Nghị định 158/2024/NĐ-CP**, effective **01/01/2025**, which **replaced Nghị định 10/2020/NĐ-CP** on transport-business conditions. (10/2020 had been amended by 47/2022 and 41/2024; 158/2024 is now the operative decree.)
- **Luật Bảo vệ dữ liệu cá nhân — Luật số 91/2025/QH15** (Personal Data Protection Law), passed 26/6/2025, effective **01/01/2026**, with implementing **Nghị định 356/2025/NĐ-CP** (also effective 01/01/2026). Nghị định 13/2023/NĐ-CP remains as transitional guidance until fully superseded.
- **Administrative reorganisation:** transport-management functions were folded into the restructured ministry (Bộ Xây dựng) during 2025; confirm which body now issues the transport-business licence and badges in your province.

### The single most important development for ECOGO
Under the old Nghị định 10/2020 (Art. 7), a contract carrier could only contract for the **whole vehicle**
and was **expressly forbidden** from pooling individual passengers, confirming per-passenger bookings,
selling per-seat, or running fixed repeating routes. That rule was the core legal threat to any "xe ghép" model.

Under the **Road Law 2024 + Nghị định 158/2024**, contract cars **under 9 seats using an electronic
contract are now permitted to pool individual passengers on one trip** ("gom khách lẻ đi chung một
chuyến xe"). **This is the legal foundation ECOGO depends on.** The first job for counsel is to confirm
that ECOGO's exact mechanic — picking up passengers along sub-segments of a driver's posted route, priced
per seat — fits squarely within the *permitted* form of electronic-contract pooling, and to identify every
condition attached to it.

---

## 1. The one structural decision: operator vs. connection platform

Everything downstream (licence holder, tax, liability, insurance) flows from this:

- Is ECOGO the **transport operator** (đơn vị kinh doanh vận tải) that holds the transport-business
  licence and bears carrier liability — or a **software connection provider** (đơn vị cung cấp phần mềm
  ứng dụng hỗ trợ kết nối vận tải) where the driver/co-op is the operator?
- The decree language ties licence-holding, tax obligations, and safety responsibility to whoever is the
  "đơn vị kinh doanh vận tải." Ask counsel to map **each** obligation to a named party under each model.
- Which is viable given that ECOGO's drivers are individuals, not a fleet? Does ECOGO need to channel
  drivers through a cooperative (hợp tác xã) or business-household structure to hold badges legally?

**Questions:** Which model minimises ECOGO's liability while remaining compliant? If ECOGO is "just software,"
who legally is the carrier for a pooled inter-province trip, and does the pooling permission still attach to them?

---

## 2. Licensing, badges, vehicle & driver conditions (Nghị định 158/2024)

- **Transport-business licence** (Giấy phép kinh doanh vận tải): who must hold it, scope, issuing body
  post-reorganisation, and timeline?
- **Vehicle badge** (phù hiệu "XE HỢP ĐỒNG"): required on every participating vehicle? Who applies — driver,
  co-op, or ECOGO?
- **Vehicle conditions:** age limit (≤12 years for <9-seat e-contract cars under the prior text — confirm under
  158/2024), legal ownership/use right, mandatory **GPS tracking device** (thiết bị giám sát hành trình) whose
  data is shared with police/tax authorities, and **camera** obligations (these applied to ≥9-seat vehicles — confirm).
- **Driver conditions:** licence class, health, the requirement that the driver can access the electronic
  contract and passenger list on the trip.
- **Surviving restrictions:** under old ND 10 there were the "whole-vehicle only," "no fixed repeating route,"
  and "no more than 30% of a vehicle's monthly trips on the same origin–destination" rules. **Ask precisely which
  of these survive, are modified, or are removed under 158/2024** — they directly constrain ECOGO's corridor model.

## 3. The pooling ("gom khách lẻ") conditions — confirm the mechanic is legal

- Exact statutory conditions to legally pool passengers on one e-contract trip.
- Does **corridor sub-segment pickup** (passenger boards/alights partway along the driver's route) qualify, or
  must all pooled passengers share substantially the same origin/destination?
- **Per-seat pricing** vs. whole-vehicle pricing — is per-seat charging permitted now, and is it "selling tickets"
  (still prohibited) or lawful contract pricing?
- The requirement to **send the contract + passenger list to the authority** before the trip, and to **retain
  passenger data ≥ 3 years** — how is this implemented for app-based, on-demand pooling at scale?

## 4. Data protection (Luật 91/2025 + Nghị định 356/2025) — effective Jan 2026

ECOGO processes phone numbers, identity/KYC data, and **continuous location** — squarely in scope.

- **Consent:** the implementing decree allows consent via app technical mechanisms; confirm the exact UX/record
  required for valid consent to process and share location data.
- **Privacy policy & data-subject rights:** access, correction, deletion ("right to be forgotten") — design these
  into the app now.
- **Sensitive data & scale:** small-business/startup exemptions from the DPO and data-protection-impact-assessment
  requirements **do not apply** to those processing large numbers of data subjects or sensitive data. Does a ride
  platform's location processing strip the startup exemption? Likely yes — confirm.
- **Cross-border transfer:** Goong, Firebase/FCM, and any cloud hosting outside Vietnam trigger cross-border
  transfer rules and possible impact assessments. Confirm obligations and whether in-country hosting is needed.
- **Retention tension:** transport law wants passenger data kept ≥3 years; data-protection law wants minimisation
  and erasure. Ask counsel to reconcile the two into one retention policy.
- **Prohibition on selling personal data** is now explicit and penalised — relevant to any future data monetisation.

## 5. Driver classification, labour & the affiliate scheme

- Are drivers **independent contractors** or could the relationship be recharacterised as employment (social
  insurance, labour obligations)?
- The **5% / 3-year affiliate** (a referring driver earns a share of a recruited driver's fees): is this lawful
  commission, and does a multi-tier referral structure risk being treated as **multi-level marketing** (kinh doanh
  đa cấp), which is separately regulated? Confirm structure and disclosures.
- Tax treatment of affiliate earnings (driver PIT, ECOGO withholding/reporting).

## 6. Tax

- VAT on the platform's 10% commission; who issues the **e-invoice** to the passenger (operator vs. platform).
- Driver personal income tax — collection/declaration responsibility under each operating model.
- The GPS/tracking data-sharing with the tax authority (Tổng cục Thuế) referenced in the decrees — what reporting
  does it imply?

## 7. Insurance

- Mandatory civil-liability insurance for passenger transport; passenger accident cover.
- Does ECOGO need platform-level liability cover in addition to drivers' policies? What's market practice for
  inter-province pooled rides?

## 8. Consumer protection, pricing & e-commerce registration

- Price display, cancellation terms, complaint handling under consumer-protection law.
- If ECOGO is a "platform," does it need **e-commerce platform registration/notification with Bộ Công Thương**?
- Advertising/brandname rules if using SMS brandname (Nghị định 91/2020 on anti-spam) — relevant to OTP/marketing SMS.

## 9. Payments (relevant when you move past cash)

- Cash-settled MVP avoids payment-licensing — confirm.
- When adding in-app payment: use a **licensed intermediary payment-service** partner (e.g., a licensed e-wallet/
  gateway) rather than holding funds yourself, to avoid needing your own payment licence.

## 10. Safety & KYC obligations

- Required driver background/KYC, vehicle inspection (đăng kiểm) verification.
- Any mandated in-trip safety features (emergency contact/SOS, trip sharing) for passenger-carrying platforms.

---

## Immediate compliance checklist — confirm before any paid pilot

1. **Operating model chosen** (operator vs. connection platform) and licence holder identified.
2. **Pooling mechanic blessed** — written confirmation that ECOGO's corridor sub-segment, per-seat model fits the
   permitted electronic-contract pooling under the Road Law 2024 / Nghị định 158/2024.
3. **Badges + GPS device** on every participating vehicle; transport-business licence in place.
4. **Electronic contract + passenger-list + ≥3-year retention** flow implemented and reconciled with the data law.
5. **Data-protection compliance** for Jan-2026 law: consent UX, privacy policy, data-subject rights, cross-border
   transfer assessment, retention policy, DPO/DPIA determination.
6. **Insurance** bound; **tax/e-invoice** responsibilities assigned; **affiliate scheme** legally reviewed.

---

## How to use this with counsel

Bring this document, the project brief, and the architecture/data-model notes. Ask the lawyer to (a) confirm the
current governing texts and any draft amendments in progress, (b) answer Section 1 first (it determines everything
else), and (c) deliver a one-page compliance roadmap mapping each obligation to a responsible party and a deadline.
Budget for a transport-law specialist **and** a data-protection specialist — the Jan-2026 data law is new enough
that general counsel may not yet be fluent in it.

*Prepared as founder-preparation material, June 2026. Legal instruments cited are public but may have been amended;
verify current text. Not a substitute for advice from a licensed Vietnamese lawyer.*
