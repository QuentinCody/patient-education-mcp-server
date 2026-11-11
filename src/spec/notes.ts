export const patedNotes = [
  "This server wraps two public APIs: /medline/* → https://connect.medlineplus.gov; /dailymed/* → https://dailymed.nlm.nih.gov/dailymed/services.",
  "MedlinePlus returns patient education. Virtual paths such as /medline/topic/icd10/{code} translate to code-system OIDs.",
  "ICD-10-CM=2.16.840.1.113883.6.90, NDC=2.16.840.1.113883.6.69, LOINC=2.16.840.1.113883.6.1, SNOMED-CT=2.16.840.1.113883.6.96.",
  "GET and form-encoded POST use the same single-code semantics. api.post accepts a field object or encoded form string, not a batch. /medline/service exposes raw Infobutton fields.",
  "MedlinePlus JSON retains code_system/code/total/topics plus full raw_response, request_parameters and fetched_at. All provider links, HTML summaries and author attribution survive staging.",
  "No provider reading level is established by informationRecipient=PROV. English medication names may be used as a fallback; Spanish medication requests require codes.",
  "NLM limits Connect to 100 requests/minute/IP and recommends caching results for 12–24 hours. No automatic MedlinePlus retries; 429 and Retry-After remain available to the caller.",
  "DailyMed SPL detail is converted from XML to labeled sections. DailyMed list/search responses retain their data/metadata envelope. DailyMed is GET-only here.",
  "Both upstream APIs are public and require no authentication. Preserve source attribution; returned links do not authorize copying full MedlinePlus pages.",
].join("\n");
