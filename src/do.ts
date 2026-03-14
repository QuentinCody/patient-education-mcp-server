/**
 * PatedDataDO — Durable Object for staging large patient education responses.
 *
 * Extends RestStagingDO with schema hints for MedlinePlus health topics,
 * DailyMed drug labels, and drug name data.
 */

import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class PatedDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        // MedlinePlus Connect response — feed with entries
        const obj = data as Record<string, unknown>;
        if (obj.feed && typeof obj.feed === "object") {
            const feed = obj.feed as Record<string, unknown>;
            if (Array.isArray(feed.entry)) {
                return {
                    tableName: "health_topics",
                    indexes: ["title", "code", "code_system"],
                };
            }
        }

        // Array of health topic entries (pre-extracted)
        if (Array.isArray(data)) {
            const sample = data[0];
            if (!sample || typeof sample !== "object") return undefined;

            // Health topic entries from MedlinePlus
            if ("title" in sample && ("summary" in sample || "oid" in sample)) {
                return {
                    tableName: "health_topics",
                    indexes: ["title", "code", "code_system"],
                };
            }

            // DailyMed SPL records
            if ("setid" in sample || "spl_set_id" in sample) {
                return {
                    tableName: "drug_labels",
                    indexes: ["setid", "drug_name", "ndc"],
                };
            }

            // DailyMed drug names
            if ("drug_name" in sample && !("setid" in sample)) {
                return {
                    tableName: "drug_names",
                    indexes: ["drug_name"],
                };
            }

            // DailyMed NDC records
            if ("ndc" in sample || "product_ndc" in sample) {
                return {
                    tableName: "ndc_codes",
                    indexes: ["ndc", "drug_name"],
                };
            }

            // DailyMed drug class records
            if ("class_name" in sample || "drug_class" in sample) {
                return {
                    tableName: "drug_classes",
                    indexes: ["class_name"],
                };
            }
        }

        // DailyMed wrapped responses with data array
        if (Array.isArray(obj.data)) {
            const sample = obj.data[0];
            if (sample && typeof sample === "object") {
                if ("setid" in sample || "spl_set_id" in sample) {
                    return {
                        tableName: "drug_labels",
                        indexes: ["setid", "drug_name", "ndc"],
                    };
                }
                if ("drug_name" in sample) {
                    return {
                        tableName: "drug_names",
                        indexes: ["drug_name"],
                    };
                }
            }
        }

        return undefined;
    }
}
