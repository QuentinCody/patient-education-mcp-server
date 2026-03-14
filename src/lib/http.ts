/**
 * Patient Education HTTP clients for MedlinePlus Connect and DailyMed APIs.
 *
 * Both APIs are public with no authentication required.
 * MedlinePlus Connect uses OID-based code system parameters.
 * DailyMed provides RESTful JSON endpoints.
 */

import { restFetch, type RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const MEDLINEPLUS_BASE = "https://connect.medlineplus.gov";
const DAILYMED_BASE = "https://dailymed.nlm.nih.gov/dailymed/services";

export interface PatedFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    /** Override timeout (default 30s) */
    timeout?: number;
    /** Override retries (default 3) */
    retries?: number;
}

/**
 * Fetch from the MedlinePlus Connect API.
 *
 * MedlinePlus Connect uses query parameters with OID-based code systems:
 * - mainSearchCriteria.v.cs = code system OID
 * - mainSearchCriteria.v.c = code value
 * - knowledgeResponseType = application/json
 */
export async function medlineFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: PatedFetchOptions,
): Promise<Response> {
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(MEDLINEPLUS_BASE, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent:
            "patient-education-mcp-server/1.0 (bio-mcp; https://github.com/QuentinCody/patient-education-mcp-server)",
    });
}

/**
 * Fetch from the DailyMed Services API.
 *
 * DailyMed provides a standard REST API with JSON responses.
 * Base URL: https://dailymed.nlm.nih.gov/dailymed/services
 */
export async function dailymedFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: PatedFetchOptions,
): Promise<Response> {
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(DAILYMED_BASE, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent:
            "patient-education-mcp-server/1.0 (bio-mcp; https://github.com/QuentinCody/patient-education-mcp-server)",
    });
}
