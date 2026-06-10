import type {
  MailParcelResult, MailOrderResult, MailReturnResult, MailDunningResult,
  ParcelStatus, ParcelRule,
  OrderStatus, OrderRule,
  ReturnStatus, ReturnRule,
  DunningStatus, DunningRule,
} from "./types";
import { MONTHS_MAP, DELIVERY_WINDOW_REGEX, PARCEL_KEYWORDS, ORDER_KEYWORDS, RETURN_KEYWORDS, DUNNING_KEYWORDS } from "./const";

/**
 * Checks if a sender email address domain matches one of the specified domains (supports regex:)
 */
export function isDomainMatched(fromLower: string, domains: string[]): boolean {
	const atIdx = fromLower.indexOf("@");
	const domainPart = atIdx !== -1 ? fromLower.substring(atIdx + 1) : fromLower;
	
	return domains.some(pattern => {
		if (pattern.startsWith("regex:")) {
			try {
				const regex = new RegExp(pattern.substring(6), "i");
				return regex.test(domainPart);
			} catch (err) {
				console.error(`[Parser] Invalid domain regex: ${pattern}`, err);
				return false;
			}
		}
		return domainPart === pattern || domainPart.endsWith(`.${pattern}`);
	});
}

/**
 * Expands regex: domain patterns (e.g. regex:^amazon\.(com|de|co\.uk)$) into a plain list.
 */
export function expandDomains(domains: string[]): string[] {
	const expanded: string[] = []
	for (const pattern of domains) {
		if (pattern.startsWith("regex:")) {
			const regexStr = pattern.substring(6)
				.replace(/^\^/, "")  // strip leading ^
				.replace(/\$$/, ""); // strip trailing $

			const groupStart = regexStr.indexOf("\\.(");
			const groupEnd = regexStr.lastIndexOf(")");
			if (groupStart !== -1 && groupEnd !== -1 && groupEnd > groupStart) {
				const prefix = regexStr.substring(0, groupStart);
				const groupContent = regexStr.substring(groupStart + 3, groupEnd);
				const options = groupContent.split("|").map(opt => opt.replace(/\\\./g, ".").replace(/\\/g, ""));
				for (const opt of options) {
					expanded.push(`${prefix}.${opt}`);
				}
			} else {
				expanded.push(pattern);
			}
		} else {
			expanded.push(pattern);
		}
	}
	return expanded;
}

/**
 * Determines parcel status from keywords in text
 */
function getParcelStatusFromKeywords(subject: string, body: string): ParcelStatus {
	const text = `${subject} ${body}`.toLowerCase();
	for (const [status, kws] of Object.entries(PARCEL_KEYWORDS)) {
		if (kws.some(k => text.includes(k))) return status as ParcelStatus;
	}
	return "unknown";
}

/**
 * Determines order status from keywords
 */
function getOrderStatusFromKeywords(subject: string, body: string): OrderStatus {
	const subjLower = subject.toLowerCase();
	for (const [status, kws] of Object.entries(ORDER_KEYWORDS)) {
		if (kws.some(k => subjLower.includes(k))) return status as OrderStatus;
	}
	const text = `${subject} ${body}`.toLowerCase();
	for (const [status, kws] of Object.entries(ORDER_KEYWORDS)) {
		if (status === "cancelled") {
			// Avoid matching "cancel" keyword against legal/cancellation rights disclosures in the body
			const strictKws = ["storniert", "cancelled", "stornierung"];
			if (strictKws.some(k => text.includes(k))) return "cancelled";
			continue;
		}
		if (kws.some(k => text.includes(k))) return status as OrderStatus;
	}
	return "unknown";
}

/**
 * Determines return status from keywords
 */
function getReturnStatusFromKeywords(subject: string, body: string): ReturnStatus {
	const text = `${subject} ${body}`.toLowerCase();
	for (const [status, kws] of Object.entries(RETURN_KEYWORDS)) {
		if (kws.some(k => text.includes(k))) return status as ReturnStatus;
	}
	return "unknown";
}

/**
 * Determines dunning status from keywords
 */
function getDunningStatusFromKeywords(subject: string, body: string): DunningStatus {
	const text = `${subject} ${body}`.toLowerCase();
	for (const [status, kws] of Object.entries(DUNNING_KEYWORDS)) {
		if (kws.some(k => text.includes(k))) return status as DunningStatus;
	}
	return "unknown";
}

/** Shared helper — builds the parser helpers object passed to custom parse() */
function buildHelpers(): any {
	return {
		testRegex: (text: string, pattern: string): boolean => {
			if (!pattern) return false;
			let cleanPattern = pattern;
			if (pattern.startsWith("regex:")) {
				cleanPattern = pattern.substring(6);
			}
			try {
				const regex = new RegExp(cleanPattern, "i");
				return regex.test(text);
			} catch {
				return text.toLowerCase().includes(pattern.toLowerCase());
			}
		},
		extractRegex: (text: string, pattern: string, groupIndexOrName: number | string = 0): string | undefined => {
			if (!pattern) return undefined;
			let cleanPattern = pattern;
			if (pattern.startsWith("regex:")) {
				cleanPattern = pattern.substring(6);
			}
			try {
				const regex = new RegExp(cleanPattern, "i");
				const match = regex.exec(text);
				if (!match) return undefined;
				if (typeof groupIndexOrName === "string") {
					return match.groups?.[groupIndexOrName];
				}
				return match[groupIndexOrName];
			} catch {
				return undefined;
			}
		},
		extractAllRegex: (text: string, pattern: string, groupName?: string): string[] => {
			if (!pattern) return [];
			let cleanPattern = pattern;
			if (pattern.startsWith("regex:")) {
				cleanPattern = pattern.substring(6);
			}
			if (cleanPattern.includes("{7,10,12}")) {
				cleanPattern = cleanPattern.replace("{7,10,12}", "{7,12}");
			}
			try {
				const regex = new RegExp(cleanPattern, "gi");
				const matches = [...text.matchAll(regex)];
				const results: string[] = [];
				for (const m of matches) {
					if (groupName && m.groups?.[groupName]) {
						const val = m.groups[groupName].trim();
						if (val && !results.includes(val)) results.push(val);
					} else {
						const val = m[0].trim();
						if (val && !results.includes(val)) results.push(val);
					}
				}
				return results;
			} catch {
				return [];
			}
		},
		getParcelStatusFromKeywords,
		getOrderStatusFromKeywords,
		getReturnStatusFromKeywords,
		getDunningStatusFromKeywords,
		parseDeliveryWindow: (text: string) => {
			if (!text) return undefined;
			const match = DELIVERY_WINDOW_REGEX.exec(text);
			if (!match) return undefined;

			const raw = match[0].trim();
			const startStr = match[1];
			const startAmPm = match[2];
			const endStr = match[3];
			const endAmPm = match[4];

			const to24h = (time: string, ampm?: string): string => {
				const parts = time.split(":");
				let hours = parseInt(parts[0], 10);
				const mins = parts[1];
				if (ampm) {
					const isPm = ampm.toLowerCase() === "pm";
					if (isPm && hours < 12) hours += 12;
					else if (!isPm && hours === 12) hours = 0;
				}
				return `${hours.toString().padStart(2, "0")}:${mins}`;
			};

			return {
				raw,
				startTime: to24h(startStr, startAmPm || endAmPm),
				endTime: to24h(endStr, endAmPm || startAmPm)
			};
		},
		monthsMap: MONTHS_MAP,
	};
}

// ─── parseParcelEmail ─────────────────────────────────────────────────────────

export function parseParcelEmail(
	from: string,
	subject: string,
	bodyPlain: string,
	bodyHtml?: string,
	rules?: ParcelRule[],
): MailParcelResult | null {
	const fromLower = from.toLowerCase().trim();
	const subClean  = subject || "";
	const bodyClean = bodyPlain || bodyHtml || "";

	if (!rules || rules.length === 0) return null;

	for (const rule of rules) {
		if (!isDomainMatched(fromLower, rule.domains)) continue;

		if (rule.parse) {
			try {
				const customResult = rule.parse(
					{ from: fromLower, subject: subClean, bodyPlain: bodyClean, bodyHtml },
					buildHelpers(),
					{ id: rule.id, name: rule.name, description: rule.description, icon_url: rule.icon_url, domains: expandDomains(rule.domains), patterns: rule.patterns }
				);
				if (customResult) return { courier: rule.id, ...customResult };
			} catch (err) {
				console.error(`[Parser] Custom parser failed for ${rule.name}:`, err);
			}
		}
	}

	return null;
}

// ─── parseOrderEmail ──────────────────────────────────────────────────────────

export function parseOrderEmail(
	from: string,
	subject: string,
	bodyPlain: string,
	bodyHtml?: string,
	rules?: OrderRule[],
): MailOrderResult | null {
	const fromLower = from.toLowerCase().trim();
	const subClean  = subject || "";
	const bodyClean = bodyPlain || bodyHtml || "";

	if (!rules || rules.length === 0) return null;

	for (const rule of rules) {
		if (!isDomainMatched(fromLower, rule.domains)) continue;

		if (rule.parse) {
			try {
				const customResult = rule.parse(
					{ from: fromLower, subject: subClean, bodyPlain: bodyClean, bodyHtml },
					buildHelpers(),
					{ id: rule.id, name: rule.name, description: rule.description, icon_url: rule.icon_url, domains: expandDomains(rule.domains), patterns: rule.patterns }
				);
				if (customResult && customResult.orderNumbers && customResult.orderNumbers.length > 0) return { courier: rule.id, ...customResult };
			} catch (err) {
				console.error(`[Parser] Custom order parser failed for ${rule.name}:`, err);
			}
		}
	}

	return null;
}

// ─── parseReturnEmail ─────────────────────────────────────────────────────────

export function parseReturnEmail(
	from: string,
	subject: string,
	bodyPlain: string,
	bodyHtml?: string,
	rules?: ReturnRule[],
): MailReturnResult | null {
	const fromLower = from.toLowerCase().trim();
	const subClean  = subject || "";
	const bodyClean = bodyPlain || bodyHtml || "";

	if (!rules || rules.length === 0) return null;

	for (const rule of rules) {
		if (!isDomainMatched(fromLower, rule.domains)) continue;

		if (rule.parse) {
			try {
				const customResult = rule.parse(
					{ from: fromLower, subject: subClean, bodyPlain: bodyClean, bodyHtml },
					buildHelpers(),
					{ id: rule.id, name: rule.name, description: rule.description, icon_url: rule.icon_url, domains: expandDomains(rule.domains), patterns: rule.patterns }
				);
				if (customResult) return { courier: rule.id, ...customResult };
			} catch (err) {
				console.error(`[Parser] Custom return parser failed for ${rule.name}:`, err);
			}
		}
	}

	return null;
}

// ─── parseDunningEmail ────────────────────────────────────────────────────────

export function parseDunningEmail(
	from: string,
	subject: string,
	bodyPlain: string,
	bodyHtml?: string,
	rules?: DunningRule[],
): MailDunningResult | null {
	const fromLower = from.toLowerCase().trim();
	const subClean  = subject || "";
	const bodyClean = bodyPlain || bodyHtml || "";

	if (!rules || rules.length === 0) return null;

	for (const rule of rules) {
		if (!isDomainMatched(fromLower, rule.domains)) continue;

		if (rule.parse) {
			try {
				const customResult = rule.parse(
					{ from: fromLower, subject: subClean, bodyPlain: bodyClean, bodyHtml },
					buildHelpers(),
					{ id: rule.id, name: rule.name, description: rule.description, icon_url: rule.icon_url, domains: expandDomains(rule.domains), patterns: rule.patterns }
				);
				if (customResult) return { courier: rule.id, ...customResult };
			} catch (err) {
				console.error(`[Parser] Custom dunning parser failed for ${rule.name}:`, err);
			}
		}
	}

	return null;
}
