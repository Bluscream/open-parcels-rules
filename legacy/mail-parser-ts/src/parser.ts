import {
	AMAZON_DELIVERED_SUBJECTS,
	AMAZON_DOMAINS,
	AMAZON_EXCEPTION_BODY_MARKER,
	AMAZON_EXCEPTION_SUBJECT,
	AMAZON_TIME_PATTERNS,
	SHIPPER_RULES_REGISTRY,
} from "./const";
import type { MailPackageResult, PackageStatus, CourierRule, MatchRule, EmailData } from "./types";

const MONTHS_MAP: Record<string, number> = {
	// English
	january: 0,
	jan: 0,
	february: 1,
	feb: 1,
	march: 2,
	mar: 2,
	april: 3,
	apr: 3,
	may: 4,
	june: 5,
	jun: 5,
	july: 6,
	jul: 6,
	august: 7,
	aug: 7,
	september: 8,
	sep: 8,
	sept: 8,
	october: 9,
	oct: 9,
	november: 10,
	nov: 10,
	december: 11,
	dec: 11,
	// Italian
	gennaio: 0,
	febbraio: 1,
	marzo: 2,
	aprile: 3,
	maggio: 4,
	giugno: 5,
	luglio: 6,
	agosto: 7,
	settembre: 8,
	ottobre: 9,
	novembre: 10,
	dicembre: 11,
	// German
	januar: 0,
	februar: 1,
	märz: 2,
	maerz: 2,
	mai: 4,
	juni: 5,
	juli: 6,
	dezember: 11,
	// Polish
	styczeń: 0,
	stycznia: 0,
	luty: 1,
	lutego: 1,
	marzec: 2,
	marca: 2,
	kwiecień: 3,
	kwietnia: 3,
	maja: 4,
	czerwiec: 5,
	czerwca: 5,
	lipiec: 6,
	lipca: 6,
	sierpień: 7,
	sierpnia: 7,
	wrzesień: 8,
	września: 8,
	październik: 9,
	października: 9,
	listopad: 10,
	listopada: 10,
	grudzień: 11,
	grudnia: 11,
};

const EXCEPTION_RULES: Record<string, { email: string[]; subject: string[] }> =
	{
		usps: {
			email: ["auto-reply@usps.com"],
			subject: ["Delivery Exception"],
		},
		ups: {
			email: ["mcinfo@ups.com"],
			subject: ["UPS Update: New Scheduled Delivery Date"],
		},
	};

/**
 * Performs high-performance prefix-based string matching
 */
export function stringMatchesRule(text: string, rule: string): boolean {
	const textLower = text.toLowerCase();
	
	if (rule.startsWith("nocase:")) {
		const target = rule.substring(7).toLowerCase();
		return textLower.includes(target);
	}
	if (rule.startsWith("case:")) {
		const target = rule.substring(5);
		return text.includes(target);
	}
	if (rule.startsWith("exact:")) {
		const target = rule.substring(6);
		return text === target;
	}
	if (rule.startsWith("exact-nocase:")) {
		const target = rule.substring(13).toLowerCase();
		return textLower === target;
	}
	if (rule.startsWith("regex:")) {
		const target = rule.substring(6);
		try {
			const regex = new RegExp(target, "i");
			return regex.test(text);
		} catch (err) {
			console.error(`Invalid matching regex pattern: ${target}`, err);
			return false;
		}
	}
	// Default: case-sensitive substring match
	return text.includes(rule);
}

/**
 * Validates match rules (from, subject, body) using prefix-based matchers
 */
function matchesMatchRule(emailData: { from: string; subject: string; body: string }, rule?: MatchRule): boolean {
	if (!rule) return false;
	
	// Check email sender
	if (rule.email && rule.email.length > 0) {
		const matchEmail = rule.email.some(pattern => stringMatchesRule(emailData.from, pattern));
		if (!matchEmail) return false;
	}
	
	// Check subject
	if (rule.subject && rule.subject.length > 0) {
		const matchSub = rule.subject.some(pattern => stringMatchesRule(emailData.subject, pattern));
		if (!matchSub) return false;
	}
	
	// Check body
	if (rule.body && rule.body.length > 0) {
		const matchBody = rule.body.some(pattern => stringMatchesRule(emailData.body, pattern));
		if (!matchBody) return false;
	}
	
	return true;
}

export interface ExtractedVariables {
	trackingNumbers: string[];
	orderNumbers: string[];
	amazonHubCode?: string;
	deliveryDate?: Date;
	itemNames?: string[];
}

/**
 * Extracts parsed fields using ES2018 Regex Named Capture Groups
 */
export function extractVariablesFromText(
	subject: string,
	body: string,
	patterns: string[]
): ExtractedVariables {
	const trackingNumbers: string[] = [];
	const orderNumbers: string[] = [];
	const itemNames: string[] = [];
	let amazonHubCode: string | undefined = undefined;
	let deliveryDate: Date | undefined = undefined;

	const textToSearch = `${subject}\n${body}`;

	for (const patternStr of patterns) {
		try {
			let isRegex = false;
			let cleanPattern = patternStr;
			
			if (patternStr.startsWith("regex:")) {
				cleanPattern = patternStr.substring(6);
				isRegex = true;
			}
			
			if (isRegex) {
				// Fix legacy Australia Post typo
				if (cleanPattern.includes("{7,10,12}")) {
					cleanPattern = cleanPattern.replace("{7,10,12}", "{7,12}");
				}
				
				const regex = new RegExp(cleanPattern, "gi");
				const matches = textToSearch.matchAll(regex);

				for (const match of matches) {
					if (match.groups) {
						// Extract using Named Capture Groups
						if (match.groups.trackingNumber) {
							const val = match.groups.trackingNumber.trim();
							if (val && !trackingNumbers.includes(val)) trackingNumbers.push(val);
						}
						if (match.groups.orderNumber) {
							const val = match.groups.orderNumber.trim();
							if (val && !orderNumbers.includes(val)) orderNumbers.push(val);
						}
						if (match.groups.amazonHubCode) {
							amazonHubCode = match.groups.amazonHubCode.trim();
						}
						if (match.groups.deliveryDate) {
							const dateVal = new Date(match.groups.deliveryDate.trim());
							if (Number.isFinite(dateVal.getTime())) {
								deliveryDate = dateVal;
							}
						}
						if (match.groups.itemName) {
							const val = match.groups.itemName.trim();
							if (val && !itemNames.includes(val)) itemNames.push(val);
						}
					} else {
						// Fallback: whole match is treated as tracking number
						let val = match[0].trim();
						if (val) {
							val = val.replace(/^[^\w]+|[^\w]+$/g, "");
							if (val && !trackingNumbers.includes(val)) {
								trackingNumbers.push(val);
							}
						}
					}
				}
			} else {
				// Substring check fallback
				if (textToSearch.includes(patternStr)) {
					const val = patternStr.trim();
					if (val && !trackingNumbers.includes(val)) {
						trackingNumbers.push(val);
					}
				}
			}
		} catch (e) {
			console.error(`Invalid regex pattern: ${patternStr}`, e);
		}
	}

	return {
		trackingNumbers,
		orderNumbers,
		amazonHubCode,
		deliveryDate,
		itemNames
	};
}

/**
 * Extracts tracking numbers matching given regex patterns from text (subject + body)
 */
export function extractTrackingNumbers(
	subject: string,
	body: string,
	patterns: string[],
): string[] {
	const tracking: string[] = [];
	const textToSearch = `${subject}\n${body}`;

	for (const patternStr of patterns) {
		try {
			let fixedPattern = patternStr;
			if (patternStr.includes("{7,10,12}")) {
				fixedPattern = patternStr.replace("{7,10,12}", "{7,12}");
			}
			const regex = new RegExp(fixedPattern, "gi");
			const matches = textToSearch.matchAll(regex);

			for (const match of matches) {
				let val = match[0].trim();
				if (val) {
					if (patternStr.includes(" ") && val.includes(" ")) {
						const parts = val.split(" ");
						if (parts.length > 1) {
							val = parts[1].trim();
						}
					}
					val = val.replace(/^[^\w]+|[^\w]+$/g, "");
					if (val && !tracking.includes(val)) {
						tracking.push(val);
					}
				}
			}
		} catch (e) {
			console.error(`Invalid regex pattern: ${patternStr}`, e);
		}
	}
	return tracking;
}

/**
 * Parses Amazon order numbers (Format: 000-0000000-0000002) from text
 */
export function extractAmazonOrders(subject: string, body: string): string[] {
	const regex = /[0-9]{3}-[0-9]{7}-[0-9]{7}/g;
	const text = `${subject}\n${body}`;
	const matches = text.matchAll(regex);
	const orders: string[] = [];
	for (const match of matches) {
		const order = match[0];
		if (!orders.includes(order)) {
			orders.push(order);
		}
	}
	return orders;
}

/**
 * Extracts Amazon Hub Locker pickup code (6 digits) from subject or body
 */
export function extractAmazonHubCode(
	subject: string,
	body: string,
): string | undefined {
	const subjectRegex = /(You have a package to pick up)(.*)(\d{6})/i;
	const bodyRegex = /(Your pickup code is <b>)(\d{6})/i;

	const subjectMatch = subjectRegex.exec(subject);
	if (subjectMatch?.[3]) {
		return subjectMatch[3];
	}

	const bodyMatch = bodyRegex.exec(body);
	if (bodyMatch?.[2]) {
		return bodyMatch[2];
	}

	return undefined;
}

/**
 * Parses Amazon delivery dates from email body
 */
export function extractAmazonDeliveryDate(body: string): Date | undefined {
	for (const search of AMAZON_TIME_PATTERNS) {
		const idx = body.indexOf(search);
		if (idx === -1) continue;

		const start = idx + search.length;
		let end = body.length;
		const endKeywords = [
			"Previously expected:",
			"Track your",
			"Per tracciare il tuo pacco",
			"View or manage order",
			"<",
			"\n",
			"\r",
		];

		for (const kw of endKeywords) {
			const kwIdx = body.indexOf(kw, start);
			if (kwIdx !== -1 && kwIdx < end) {
				end = kwIdx;
			}
		}

		const arriveDateStr = body.substring(start, end).replace(/>/g, "").trim();
		if (!arriveDateStr) continue;

		const lowerDateStr = arriveDateStr.toLowerCase();
		const todayWords = ["today", "oggi", "dzisiaj", "heute"];
		const tomorrowWords = ["tomorrow", "domani", "jutro", "morgen"];

		if (todayWords.some((w) => lowerDateStr.includes(w))) {
			return new Date();
		}
		if (tomorrowWords.some((w) => lowerDateStr.includes(w))) {
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			return tomorrow;
		}

		const tokens = arriveDateStr
			.replace(/,/g, "")
			.split(/\s+/)
			.map((t) => t.toLowerCase().trim())
			.filter(Boolean);

		let foundMonth: number | undefined;
		let foundDay: number | undefined;

		for (const token of tokens) {
			if (MONTHS_MAP[token] !== undefined) {
				foundMonth = MONTHS_MAP[token];
			} else {
				const dayVal = parseInt(token, 10);
				if (!Number.isNaN(dayVal) && dayVal >= 1 && dayVal <= 31) {
					foundDay = dayVal;
				}
			}
		}

		if (foundMonth !== undefined && foundDay !== undefined) {
			const date = new Date();
			date.setMonth(foundMonth);
			date.setDate(foundDay);
			date.setHours(12, 0, 0, 0);

			const now = new Date();
			if (date.getTime() - now.getTime() < -90 * 24 * 60 * 60 * 1000) {
				date.setFullYear(date.getFullYear() + 1);
			}
			return date;
		}
	}

	return undefined;
}

/**
 * Determines package status from keywords in text (subject + body)
 */
function getStatusFromKeywords(subject: string, body: string): PackageStatus {
	const text = `${subject} ${body}`.toLowerCase();

	const deliveredKeywords = [
		"delivered",
		"zugestellt",
		"geliefert",
		"doręczona",
		"odbioru",
		"consegna effettuata",
	];
	const exceptionKeywords = [
		"exception",
		"running late",
		"delay",
		"delayed",
		"verspätung",
	];
	const arrivingKeywords = [
		"arriving",
		"out for delivery",
		"scheduled for delivery",
		"dostawa dzisiaj",
		"kommt heute",
		"dziś doręczamy",
		"arriverà",
		"incoming",
	];
	const sentKeywords = [
		"shipped",
		"sent",
		"on its way",
		"w drodze",
		"nadana",
		"versendet",
	];
	const orderedKeywords = [
		"ordered",
		"bestellt",
		"order confirmation",
		"potwierdzenie zamówienia",
	];

	if (deliveredKeywords.some((k) => text.includes(k))) return "delivered";
	if (exceptionKeywords.some((k) => text.includes(k))) return "exception";
	if (arrivingKeywords.some((k) => text.includes(k))) return "arriving";
	if (sentKeywords.some((k) => text.includes(k))) return "sent";
	if (orderedKeywords.some((k) => text.includes(k))) return "ordered";

	return "unknown";
}

/**
 * Main parser entry point. Dynamic rules are prioritized, falling back to legacy constants.
 */
export function parseEmail(
	from: string,
	subject: string,
	bodyPlain: string,
	bodyHtml?: string,
	dynamicRules?: CourierRule[],
): MailPackageResult | null {
	const fromLower = from.toLowerCase().trim();
	const subClean = subject || "";
	const bodyClean = bodyPlain || bodyHtml || "";

	// 1. Evaluate Dynamic Outsourced Rules (Priority)
	if (dynamicRules && dynamicRules.length > 0) {
		for (const rule of dynamicRules) {
			const matchesDomains = rule.domains.some(domain => 
				fromLower.endsWith(`@${domain}`) || fromLower.endsWith(`.${domain}`)
			);
			
			let isMatched = matchesDomains;
			let detectedStatus: PackageStatus = "unknown";
			
			if (isMatched && rule.statusRules) {
				const emailData = { from: fromLower, subject: subClean, body: bodyClean };
				
				if (matchesMatchRule(emailData, rule.statusRules.exception)) {
					detectedStatus = "exception";
				} else if (matchesMatchRule(emailData, rule.statusRules.delivered)) {
					detectedStatus = "delivered";
				} else if (matchesMatchRule(emailData, rule.statusRules.arriving)) {
					detectedStatus = "arriving";
				} else if (matchesMatchRule(emailData, rule.statusRules.sent)) {
					detectedStatus = "sent";
				} else if (matchesMatchRule(emailData, rule.statusRules.ordered)) {
					detectedStatus = "ordered";
				} else {
					// None of the matched statuses passed
					isMatched = false;
				}
			}
			
			if (isMatched) {
				// Evaluate custom javascript parser logic if it exists
				if (rule.parse) {
					try {
						const customResult = rule.parse(
							{ from: fromLower, subject: subClean, bodyPlain: bodyClean, bodyHtml },
							{
								extractTrackingNumbers: (text, patterns) => {
									return extractTrackingNumbers(subClean, text, patterns);
								},
								extractRegex: (text, pattern, groupIndex = 0) => {
									try {
										const regex = new RegExp(pattern, "i");
										const match = regex.exec(text);
										return match?.[groupIndex] || undefined;
									} catch {
										return undefined;
									}
								}
							}
						);
						if (customResult) return customResult;
					} catch (customError) {
						console.error(`[Parser] Custom parser callback failed for ${rule.name}:`, customError);
					}
				}

				// Fully declarative named capture group extraction
				const extracted = extractVariablesFromText(subClean, bodyClean, rule.tracking?.patterns || []);
				return {
					courier: rule.id,
					trackingNumbers: extracted.trackingNumbers,
					status: detectedStatus,
					orderNumbers: extracted.orderNumbers.length > 0 ? extracted.orderNumbers : undefined,
					amazonHubCode: extracted.amazonHubCode,
					deliveryDate: extracted.deliveryDate
				};
			}
		}
	}

	// 2. Handle Amazon Emails (Legacy)
	const isAmazon =
		fromLower.includes("thehub@amazon.com") ||
		AMAZON_DOMAINS.some((domain) => {
			if (fromLower.endsWith(`@${domain}`)) return true;
			const atIdx = fromLower.indexOf("@");
			if (atIdx !== -1) {
				const prefix = fromLower.substring(0, atIdx);
				const domainPart = fromLower.substring(atIdx + 1);
				return (
					domainPart === domain &&
					[
						"order-update",
						"shipment-tracking",
						"conferma-spedizione",
						"delivering",
					].includes(prefix)
				);
			}
			return false;
		});

	if (isAmazon) {
		let status: PackageStatus = "arriving";
		if (AMAZON_DELIVERED_SUBJECTS.some((s) => subClean.includes(s))) {
			status = "delivered";
		} else if (
			subClean.includes(AMAZON_EXCEPTION_SUBJECT) &&
			bodyClean.includes(AMAZON_EXCEPTION_BODY_MARKER)
		) {
			status = "exception";
		}

		const hubCode = extractAmazonHubCode(subClean, bodyClean);
		const orderNumbers = extractAmazonOrders(subClean, bodyClean);
		const deliveryDate = extractAmazonDeliveryDate(bodyClean);

		return {
			courier: "amazon",
			trackingNumbers: orderNumbers,
			status,
			orderNumbers,
			amazonHubCode: hubCode,
			deliveryDate,
		};
	}

	// 3. Handle Courier Senders registered in SHIPPER_RULES_REGISTRY (Legacy)
	for (const [courier, entry] of Object.entries(SHIPPER_RULES_REGISTRY)) {
		let matchesSender = false;
		let status: PackageStatus | null = null;

		const exc = EXCEPTION_RULES[courier];
		if (exc?.email.some((e) => fromLower.includes(e.toLowerCase()))) {
			if (
				exc.subject.some((s) =>
					subClean.toLowerCase().includes(s.toLowerCase()),
				)
			) {
				matchesSender = true;
				status = "exception";
			}
		}

		if (
			!status &&
			entry.delivered.email.some((e) => fromLower.includes(e.toLowerCase()))
		) {
			const subMatch =
				!entry.delivered.subject ||
				entry.delivered.subject.some((s) =>
					subClean.toLowerCase().includes(s.toLowerCase()),
				);
			const bodyMatch =
				!entry.delivered.body ||
				entry.delivered.body.some((b) =>
					bodyClean.toLowerCase().includes(b.toLowerCase()),
				);
			if (subMatch && bodyMatch) {
				matchesSender = true;
				status = "delivered";
			}
		}

		if (
			!status &&
			entry.delivering.email.some((e) => fromLower.includes(e.toLowerCase()))
		) {
			const subMatch =
				!entry.delivering.subject ||
				entry.delivering.subject.some((s) =>
					subClean.toLowerCase().includes(s.toLowerCase()),
				);
			const bodyMatch =
				!entry.delivering.body ||
				entry.delivering.body.some((b) =>
					bodyClean.toLowerCase().includes(b.toLowerCase()),
				);
			if (subMatch && bodyMatch) {
				matchesSender = true;
				status = "arriving";
			}
		}

		if (matchesSender) {
			const trackingNumbers = extractTrackingNumbers(
				subClean,
				bodyClean,
				entry.tracking.pattern,
			);
			return {
				courier,
				trackingNumbers,
				status: status || "unknown",
			};
		}
	}

	// 4. Dynamic Fallback: Scan text for any valid dynamic courier tracking numbers
	if (dynamicRules && dynamicRules.length > 0) {
		for (const rule of dynamicRules) {
			if (rule.tracking && rule.tracking.patterns.length > 0) {
				const extracted = extractVariablesFromText(subClean, bodyClean, rule.tracking.patterns);
				if (extracted.trackingNumbers.length > 0) {
					return {
						courier: rule.id,
						trackingNumbers: extracted.trackingNumbers,
						status: getStatusFromKeywords(subClean, bodyClean),
						orderNumbers: extracted.orderNumbers.length > 0 ? extracted.orderNumbers : undefined,
						amazonHubCode: extracted.amazonHubCode,
						deliveryDate: extracted.deliveryDate
					};
				}
			}
		}
	}

	// 5. Fallback: Scan text for any valid legacy courier tracking numbers
	for (const [courier, entry] of Object.entries(SHIPPER_RULES_REGISTRY)) {
		if (entry.tracking && entry.tracking.pattern.length > 0) {
			const trackingNumbers = extractTrackingNumbers(
				subClean,
				bodyClean,
				entry.tracking.pattern,
			);
			if (trackingNumbers.length > 0) {
				return {
					courier,
					trackingNumbers,
					status: getStatusFromKeywords(subClean, bodyClean),
				};
			}
		}
	}

	return null;
}
