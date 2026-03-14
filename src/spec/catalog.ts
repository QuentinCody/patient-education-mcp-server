/**
 * Patient Education API catalog — covers MedlinePlus Connect and DailyMed Services.
 *
 * MedlinePlus Connect: Patient-friendly health topic information by medical codes.
 * DailyMed Services: FDA drug label (SPL) data, drug names, NDC codes, pill identification.
 *
 * Virtual path routing:
 *   /medline/*   → MedlinePlus Connect (OID code system translation handled by adapter)
 *   /dailymed/*  → DailyMed Services REST API
 */

import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const patedCatalog: ApiCatalog = {
    name: "Patient Education (MedlinePlus + DailyMed)",
    baseUrl: "virtual://patient-education",
    version: "1.0",
    auth: "none",
    endpointCount: 18,
    notes:
        "- This server wraps TWO public APIs via virtual path prefixes:\n" +
        "  /medline/* routes to MedlinePlus Connect (https://connect.medlineplus.gov)\n" +
        "  /dailymed/* routes to DailyMed Services (https://dailymed.nlm.nih.gov/dailymed/services)\n" +
        "- MedlinePlus returns patient-friendly content suitable for discharge instructions and patient handouts\n" +
        "- The adapter translates clean paths like /medline/topic/icd10/{code} into OID-based query params\n" +
        "- Code system OIDs: ICD-10-CM=2.16.840.1.113883.6.90, NDC=2.16.840.1.113883.6.69, " +
        "LOINC=2.16.840.1.113883.6.1, SNOMED-CT=2.16.840.1.113883.6.96\n" +
        "- DailyMed SPLs contain structured product labeling with all FDA drug label sections\n" +
        "- Pill identification: search DailyMed SPLs by imprint, color, shape, size\n" +
        "- Both APIs are free, public, and require no authentication\n" +
        "- MedlinePlus responses use an Atom/JSON feed format with entries under feed.entry\n" +
        "- DailyMed responses wrap results in a {data: [...], metadata: {...}} envelope",
    endpoints: [
        // ============================================================
        // MedlinePlus Connect — Health Topics by Medical Code
        // ============================================================
        {
            method: "GET",
            path: "/medline/topic/icd10/{code}",
            summary:
                "Get patient-friendly health topic information for an ICD-10-CM diagnosis code",
            category: "medline",
            pathParams: [
                {
                    name: "code",
                    type: "string",
                    required: true,
                    description:
                        "ICD-10-CM code (e.g. E11.9 for Type 2 diabetes, I10 for hypertension, J06.9 for URI)",
                },
            ],
            queryParams: [
                {
                    name: "informationRecipient.languageCode.c",
                    type: "string",
                    required: false,
                    description: "Language code (e.g. 'en' for English, 'es' for Spanish)",
                },
            ],
        },
        {
            method: "GET",
            path: "/medline/topic/ndc/{code}",
            summary:
                "Get patient-friendly drug information for an NDC (National Drug Code)",
            category: "medline",
            pathParams: [
                {
                    name: "code",
                    type: "string",
                    required: true,
                    description:
                        "NDC code (e.g. 0069-0150-01 for Lipitor). Use dashes; 10 or 11 digits.",
                },
            ],
            queryParams: [
                {
                    name: "informationRecipient.languageCode.c",
                    type: "string",
                    required: false,
                    description: "Language code (e.g. 'en', 'es')",
                },
            ],
        },
        {
            method: "GET",
            path: "/medline/topic/loinc/{code}",
            summary: "Get patient-friendly lab test information for a LOINC code",
            category: "medline",
            pathParams: [
                {
                    name: "code",
                    type: "string",
                    required: true,
                    description:
                        "LOINC code (e.g. 2345-7 for Glucose, 718-7 for Hemoglobin, 4548-4 for HbA1c)",
                },
            ],
            queryParams: [
                {
                    name: "informationRecipient.languageCode.c",
                    type: "string",
                    required: false,
                    description: "Language code (e.g. 'en', 'es')",
                },
            ],
        },
        {
            method: "GET",
            path: "/medline/topic/snomed/{code}",
            summary:
                "Get patient-friendly health topic information for a SNOMED-CT concept code",
            category: "medline",
            pathParams: [
                {
                    name: "code",
                    type: "string",
                    required: true,
                    description:
                        "SNOMED-CT code (e.g. 73211009 for Diabetes mellitus, 38341003 for Hypertension)",
                },
            ],
            queryParams: [
                {
                    name: "informationRecipient.languageCode.c",
                    type: "string",
                    required: false,
                    description: "Language code (e.g. 'en', 'es')",
                },
            ],
        },
        {
            method: "GET",
            path: "/medline/topic/icd9/{code}",
            summary:
                "Get patient-friendly health topic information for a legacy ICD-9-CM code",
            category: "medline",
            pathParams: [
                {
                    name: "code",
                    type: "string",
                    required: true,
                    description:
                        "ICD-9-CM code (e.g. 250.00 for Diabetes, 401.9 for Hypertension)",
                },
            ],
            queryParams: [
                {
                    name: "informationRecipient.languageCode.c",
                    type: "string",
                    required: false,
                    description: "Language code",
                },
            ],
        },
        {
            method: "GET",
            path: "/medline/topic/rxnorm/{code}",
            summary: "Get patient-friendly drug information for an RxNorm concept (RxCUI)",
            category: "medline",
            pathParams: [
                {
                    name: "code",
                    type: "string",
                    required: true,
                    description:
                        "RxNorm RxCUI code (e.g. 197361 for Atorvastatin, 310965 for Metformin 500mg)",
                },
            ],
            queryParams: [
                {
                    name: "informationRecipient.languageCode.c",
                    type: "string",
                    required: false,
                    description: "Language code",
                },
            ],
        },
        {
            method: "GET",
            path: "/medline/topic/cpt/{code}",
            summary:
                "Get patient-friendly procedure information for a CPT (Current Procedural Terminology) code",
            category: "medline",
            pathParams: [
                {
                    name: "code",
                    type: "string",
                    required: true,
                    description:
                        "CPT code (e.g. 99213 for office visit, 71046 for chest X-ray)",
                },
            ],
            queryParams: [
                {
                    name: "informationRecipient.languageCode.c",
                    type: "string",
                    required: false,
                    description: "Language code",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — Drug Labels (SPLs)
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/spls.json",
            summary:
                "Search drug labels (SPLs) by drug name, setid, NDC, or other criteria. Returns paginated list.",
            category: "dailymed",
            queryParams: [
                {
                    name: "drug_name",
                    type: "string",
                    required: false,
                    description: "Drug name to search (e.g. 'aspirin', 'metformin', 'atorvastatin')",
                },
                {
                    name: "setid",
                    type: "string",
                    required: false,
                    description: "SPL Set ID (UUID format)",
                },
                {
                    name: "ndc",
                    type: "string",
                    required: false,
                    description: "National Drug Code (e.g. 0069-0150-01)",
                },
                {
                    name: "rxcui",
                    type: "string",
                    required: false,
                    description: "RxNorm Concept Unique Identifier",
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number (1-based)",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page (default 10, max 100)",
                },
            ],
        },
        {
            method: "GET",
            path: "/dailymed/v2/spls/{setid}.json",
            summary:
                "Get detailed drug label (SPL) by Set ID. Returns all label sections including indications, dosage, warnings, and adverse reactions.",
            category: "dailymed",
            pathParams: [
                {
                    name: "setid",
                    type: "string",
                    required: true,
                    description: "SPL Set ID (UUID, e.g. from spls.json search results)",
                },
            ],
        },
        {
            method: "GET",
            path: "/dailymed/v2/spls/{setid}/media.json",
            summary:
                "Get media files (images, including pill images) associated with a drug label",
            category: "dailymed",
            pathParams: [
                {
                    name: "setid",
                    type: "string",
                    required: true,
                    description: "SPL Set ID",
                },
            ],
        },
        {
            method: "GET",
            path: "/dailymed/v2/spls/{setid}/ndcs.json",
            summary: "Get all NDC codes associated with a drug label (SPL)",
            category: "dailymed",
            pathParams: [
                {
                    name: "setid",
                    type: "string",
                    required: true,
                    description: "SPL Set ID",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — Drug Names
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/drugnames.json",
            summary:
                "Search drug names. Returns a list of drug name suggestions for autocomplete or lookup.",
            category: "dailymed",
            queryParams: [
                {
                    name: "drug_name",
                    type: "string",
                    required: false,
                    description: "Drug name search term (partial match supported)",
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page (default 10, max 100)",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — Drug Classes
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/drugclasses.json",
            summary:
                "Search or list pharmacologic drug classes (VA, EPC, MoA, PE, CS classifications)",
            category: "dailymed",
            queryParams: [
                {
                    name: "drug_class_name",
                    type: "string",
                    required: false,
                    description: "Drug class name to search (e.g. 'statin', 'beta blocker')",
                },
                {
                    name: "drug_class_type",
                    type: "string",
                    required: false,
                    description:
                        "Classification type filter",
                    enum: ["VA", "EPC", "MoA", "PE", "CS"],
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — NDC Codes
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/ndcs.json",
            summary: "Search NDC (National Drug Code) records with product details",
            category: "dailymed",
            queryParams: [
                {
                    name: "ndc",
                    type: "string",
                    required: false,
                    description: "NDC code to search (e.g. 0069-0150-01)",
                },
                {
                    name: "drug_name",
                    type: "string",
                    required: false,
                    description: "Drug name filter",
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — Pill Identification (via SPL search)
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/spls.json",
            summary:
                "Search drug labels for pill identification by imprint, color, shape, or size. " +
                "Combine filters: imprint text visible on the pill, color name, shape name, and size in mm.",
            category: "dailymed",
            queryParams: [
                {
                    name: "imprint",
                    type: "string",
                    required: false,
                    description:
                        "Text imprinted on the pill (e.g. 'APO', 'M', '10')",
                },
                {
                    name: "color",
                    type: "string",
                    required: false,
                    description:
                        "Pill color (e.g. 'WHITE', 'BLUE', 'YELLOW', 'PINK', 'ORANGE', 'RED', 'GREEN')",
                },
                {
                    name: "shape",
                    type: "string",
                    required: false,
                    description:
                        "Pill shape (e.g. 'ROUND', 'OVAL', 'CAPSULE', 'OBLONG', 'RECTANGLE', 'DIAMOND', 'TRIANGLE')",
                },
                {
                    name: "size",
                    type: "number",
                    required: false,
                    description: "Pill size in millimeters (e.g. 10)",
                },
                {
                    name: "score",
                    type: "number",
                    required: false,
                    description: "Number of score lines on the pill (1, 2, 3, or 4)",
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — Application Numbers (NDA/ANDA)
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/applicationnumbers.json",
            summary:
                "Search by FDA application number (NDA or ANDA) to find associated drug labels",
            category: "dailymed",
            queryParams: [
                {
                    name: "application_number",
                    type: "string",
                    required: false,
                    description:
                        "FDA application number (e.g. NDA020702 for Lipitor)",
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — Unii Codes
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/uniis.json",
            summary:
                "Search UNII (Unique Ingredient Identifier) codes. Maps ingredient names to FDA UNII codes.",
            category: "dailymed",
            queryParams: [
                {
                    name: "unii_code",
                    type: "string",
                    required: false,
                    description: "UNII code to look up",
                },
                {
                    name: "substance_name",
                    type: "string",
                    required: false,
                    description: "Substance/ingredient name to search",
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page",
                },
            ],
        },

        // ============================================================
        // DailyMed Services — Resources (Labeler info)
        // ============================================================
        {
            method: "GET",
            path: "/dailymed/v2/organizations.json",
            summary:
                "Search pharmaceutical organizations/labelers by name or DUNS number",
            category: "dailymed",
            queryParams: [
                {
                    name: "organization_name",
                    type: "string",
                    required: false,
                    description: "Organization/labeler name (e.g. 'Pfizer', 'Merck')",
                },
                {
                    name: "page",
                    type: "number",
                    required: false,
                    description: "Page number",
                },
                {
                    name: "pagesize",
                    type: "number",
                    required: false,
                    description: "Results per page",
                },
            ],
        },
    ],
};
