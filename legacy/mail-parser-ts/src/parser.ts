import type { MailPackageResult, PackageStatus, CourierRule, MatchRule } from "./types";

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
 * Main parser entry point. Completely generic dynamic parsing engine.
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

	// 2. Dynamic Fallback: Scan text for any valid dynamic courier tracking numbers
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

	return null;
}
